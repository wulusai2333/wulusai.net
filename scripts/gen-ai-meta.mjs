/**
 * 文章级 AI 元数据生成器
 * ---------------------------------------------------------------
 * 在 `pnpm dev` / `pnpm build` 之前自动运行，产出四类东西：
 *
 *   1. theme/summaries.json  —— 每篇文章的一句话摘要（驱动文章顶部 TL;DR）
 *   2. theme/related.json    —— 每篇文章的相关推荐（TF-IDF 余弦相似度）
 *   3. public/md/<路径>.md   —— 正文的纯 Markdown 镜像
 *                               （给页面上的「复制 Markdown」按钮用）
 *   4. public/llms.txt 与 public/llms-full.txt
 *                            —— 给 AI 爬虫读的站点索引 / 全文
 *
 * 摘要策略（两级，可平滑升级）：
 *   · 配了 AI_API_KEY  → 调 OpenAI 兼容接口真写摘要，结果按内容哈希缓存，
 *                        没改动的文章第二次构建不会重复请求。
 *   · 没配 key         → 退化成「抽取式摘要」：挑正文第一个有信息量的段落。
 *                        宁可给一段原文，也不编造。
 *
 * 站点规模只有几十篇，这里全部用 Node 原生实现，不引任何依赖。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DOCS_ROOT = path.resolve(HERE, '../docs')
const THEME_DIR = path.join(DOCS_ROOT, '.vitepress/theme')
const PUBLIC_DIR = path.join(DOCS_ROOT, 'public')
const MD_MIRROR_DIR = path.join(PUBLIC_DIR, 'md')
const CACHE_FILE = path.join(THEME_DIR, '.ai-cache.json')
/**
 * 手工摘要（人工/离线模型写好并入库，优先于一切自动生成的结果）。
 * 站点只有几十篇，这份文件是「摘要质量」最可靠的保证：
 * 没配 API key 的构建也能拿到像样的摘要，而不是原文碎片。
 */
const MANUAL_FILE = path.join(THEME_DIR, 'summaries.manual.json')

const SITE_NAME = '呜路塞的知识库'
const SITE_URL = 'https://wulusai.net'
const RELATED_LIMIT = 4
const SUMMARY_MAX = 120

/** 摘要用的接口配置（全部走环境变量，仓库里不留任何密钥） */
const AI_BASE = (process.env.AI_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '')
const AI_KEY = process.env.AI_API_KEY || ''
const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat'

/* ---------------------------------------------------------------------------
   1. 收集与解析
   ------------------------------------------------------------------------ */

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // public 里会有本脚本自己生成的 md 镜像，必须跳过，否则会把镜像当原文
      if (full === PUBLIC_DIR) continue
      walk(full, out)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

const rel = (abs) => path.relative(DOCS_ROOT, abs).split(path.sep).join('/')
/** index.md 对应目录本身，其余对应 `<名字>.html` */
const toLink = (relative) =>
  '/' + relative.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1')

/** 分离 frontmatter 与正文 */
function splitFrontmatter(text) {
  if (!text.startsWith('---')) return [{}, text]
  const end = text.indexOf('\n---', 3)
  if (end === -1) return [{}, text]
  const raw = text.slice(text.indexOf('\n', 3) + 1, end)
  const body = text.slice(text.indexOf('\n', end + 1) + 1)
  const meta = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = /^(\w[\w-]*):\s*(.*)$/.exec(line)
    if (match) meta[match[1]] = match[2].replace(/^["']|["']$/g, '').trim()
  }
  return [meta, body]
}

/** 去掉 Markdown 语法，得到用于相似度计算与摘要的纯文本 */
function toPlainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')        // 代码块
    .replace(/`[^`]*`/g, ' ')               // 行内代码
    .replace(/^:::.*$/gm, ' ')              // 提示容器标记
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')  // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/^\s{0,3}#{1,6}\s+/gm, ' ')    // 标题标记
    .replace(/^\s{0,3}>\s?/gm, ' ')         // 引用
    .replace(/^\s*[-*+]\s+/gm, ' ')         // 列表
    .replace(/^\s*\|.*\|\s*$/gm, ' ')       // 表格
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 抽取式摘要：正文里第一个「有信息量」的段落 */
function extractiveSummary(body) {
  const lines = body.split(/\r?\n/)
  let inFence = false
  const clauses = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (!trimmed) continue
    // 跳过标题、容器标记、表格、纯图片、HTML
    if (/^#{1,6}\s/.test(trimmed)) continue
    if (trimmed.startsWith(':::')) continue
    if (trimmed.startsWith('|')) continue
    if (trimmed.startsWith('<')) continue
    if (/^!\[/.test(trimmed)) continue
    // 引用块通常是"注"，放在第二位考虑
    const text = toPlainText(trimmed.replace(/^>\s?/, ''))
    if (text.length < 12) continue
    clauses.push(text)
    if (clauses.length >= 2) break
  }

  const pick = clauses.join(' ').trim()
  if (!pick) return ''
  return pick.length > SUMMARY_MAX ? pick.slice(0, SUMMARY_MAX).replace(/[，、；,;]$/, '') + '…' : pick
}

/* ---------------------------------------------------------------------------
   2. TF-IDF 相关文章
   ------------------------------------------------------------------------ */

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** 与站内搜索一致的中文切分：单字 + 相邻二字组，兼顾召回与准确 */
function tokenize(text) {
  const chunks = text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+|[A-Za-z0-9_]+/g) ?? []
  const tokens = []
  for (const chunk of chunks) {
    if (CJK.test(chunk)) {
      const chars = Array.from(chunk)
      for (let i = 0; i < chars.length; i++) {
        if (i + 1 < chars.length) tokens.push(chars[i] + chars[i + 1])
      }
    } else if (chunk.length > 2) {
      tokens.push(chunk.toLowerCase())
    }
  }
  return tokens
}

function buildRelated(docs) {
  const N = docs.length
  const df = new Map()
  const vectors = docs.map((doc) => {
    const tf = new Map()
    for (const token of tokenize(doc.title + ' ' + doc.plain)) {
      tf.set(token, (tf.get(token) ?? 0) + 1)
    }
    for (const token of tf.keys()) df.set(token, (df.get(token) ?? 0) + 1)
    return tf
  })

  // 稀疏 TF-IDF 向量 + L2 归一化，方便后面直接点积当余弦
  const norms = vectors.map((tf) => {
    const out = new Map()
    for (const [token, count] of tf) {
      const idf = Math.log((N + 1) / ((df.get(token) ?? 0) + 1)) + 1
      out.set(token, (1 + Math.log(count)) * idf)
    }
    let sum = 0
    for (const value of out.values()) sum += value * value
    const norm = Math.sqrt(sum) || 1
    for (const [token, value] of out) out.set(token, value / norm)
    return out
  })

  const result = {}
  for (let i = 0; i < N; i++) {
    const scored = []
    for (let j = 0; j < N; j++) {
      if (i === j) continue
      // 目录相同的文章天然更相关，给一点点加成
      const sameDir = docs[i].relative.split('/')[0] === docs[j].relative.split('/')[0] ? 0.04 : 0
      const a = norms[i]
      const b = norms[j]
      const [small, large] = a.size < b.size ? [a, b] : [b, a]
      let dot = 0
      for (const [token, value] of small) {
        const other = large.get(token)
        if (other) dot += value * other
      }
      if (dot > 0.02) scored.push({ j, score: dot + sameDir })
    }
    scored.sort((x, y) => y.score - x.score)
    result[docs[i].relative] = scored.slice(0, RELATED_LIMIT).map(({ j, score }) => ({
      title: docs[j].title,
      url: toLink(docs[j].relative),
      score: Math.round(score * 100)
    }))
  }
  return result
}

/* ---------------------------------------------------------------------------
   3. 可选的 LLM 摘要（带内容哈希缓存）
   ------------------------------------------------------------------------ */

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)

async function llmSummary(title, plain) {
  const response = await fetch(`${AI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${AI_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.2,
      max_tokens: 160,
      messages: [
        {
          role: 'system',
          content:
            '你是技术笔记的摘要助手。用一句中文概括文章，面向正在检索资料的开发者，' +
            '保留关键的版本号、命令名与结论，不要出现「本文」「这篇文章」这类空话，' +
            '不要用 Markdown，长度控制在 60 字以内。'
        },
        { role: 'user', content: `标题：${title}\n\n正文：\n${plain.slice(0, 6000)}` }
      ]
    }),
    signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json()
  return (data.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '')
}

/* ---------------------------------------------------------------------------
   4. 主流程
   ------------------------------------------------------------------------ */

const files = walk(DOCS_ROOT).sort()
const docs = files.map((abs) => {
  const raw = fs.readFileSync(abs, 'utf8')
  const [meta, body] = splitFrontmatter(raw)
  const relative = rel(abs)
  return {
    abs,
    relative,
    meta,
    body,
    raw,
    title: meta.title || path.basename(relative, '.md'),
    plain: toPlainText(body)
  }
})

// 参与摘要与相关推荐的「文章」：排除站点页面（index/about）与英文目录
const articles = docs.filter(
  (doc) =>
    doc.relative.includes('/') &&
    !doc.relative.startsWith('en/') &&
    !doc.relative.endsWith('index.md') &&
    doc.plain.length > 0
)

/* ---- 摘要 ---- */
const cache = loadCache()
const nextCache = {}
const summaries = {}
let llmUsed = 0
let llmFailed = 0
let manualUsed = 0

function loadManual() {
  try {
    return JSON.parse(fs.readFileSync(MANUAL_FILE, 'utf8'))
  } catch {
    return {}
  }
}
const manual = loadManual()

for (const doc of articles) {
  const key = hash(doc.title + '\n' + doc.plain)

  // 1) 入库的手工摘要优先级最高：稳定、可控、不花 API 额度
  const handwritten = manual[doc.relative]
  if (typeof handwritten === 'string' && handwritten.trim()) {
    summaries[doc.relative] = { text: handwritten.trim(), by: 'manual' }
    nextCache[doc.relative] = { key, summary: handwritten.trim() }
    manualUsed++
    continue
  }

  // 2) 配了 API key 就让模型写，结果按内容哈希缓存，没改动的文章不重复请求
  let summary = ''
  if (AI_KEY) {
    if (cache[doc.relative]?.key === key && cache[doc.relative].summary) {
      summary = cache[doc.relative].summary
    } else {
      try {
        summary = await llmSummary(doc.title, doc.plain)
        llmUsed++
      } catch (error) {
        llmFailed++
        console.warn(`[gen-ai-meta] 摘要生成失败（${doc.relative}）：${error.message}`)
      }
    }
  }

  // 3) 兜底：抽取式摘要。宁可给一段原文，也不编造。
  if (!summary) {
    const extracted = extractiveSummary(doc.body)
    if (extracted) summaries[doc.relative] = { text: extracted, by: 'extract' }
  } else {
    summaries[doc.relative] = { text: summary, by: 'llm' }
  }
  nextCache[doc.relative] = { key, summary }
}

/* ---- 相关文章 ---- */
const related = buildRelated(articles)

/* ---- Markdown 镜像 + llms 文件 ---- */
fs.rmSync(MD_MIRROR_DIR, { recursive: true, force: true })
for (const doc of docs) {
  const target = path.join(MD_MIRROR_DIR, doc.relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  // 镜像只保留正文：读者要的是内容，不是构建配置
  fs.writeFileSync(target, doc.body.trimStart(), 'utf8')
}

const { sections: SECTIONS } = JSON.parse(
  fs.readFileSync(path.join(DOCS_ROOT, '.vitepress/sections.json'), 'utf8')
)

const llmsLines = [
  `# ${SITE_NAME}`,
  '',
  '> 一个程序员的私人知识库：Java / Linux 运维 / 数据库 / Git / 安全实验 / AI 绘画与大模型。',
  '> 内容以「踩过的坑 + 可复现的命令 + 版本说明」为主，正文均为中文。',
  '',
  '## 说明',
  '',
  `- 站点地址：${SITE_URL}`,
  '- 每篇文章的纯 Markdown 版本位于本文件同级的 `/md/` 目录下，路径与站内路径一致，例如 `/md/Git/分支与合并.md`。',
  '- 允许引用与转载，请保留原文链接。',
  ''
]

for (const section of SECTIONS) {
  const owned = articles.filter((doc) => doc.relative.startsWith(section.dir + '/'))
  if (!owned.length) continue
  llmsLines.push(`## ${section.text}`, '')
  for (const doc of owned) {
    const summary = summaries[doc.relative]?.text
    llmsLines.push(`- [${doc.title}](${SITE_URL}${toLink(doc.relative)})${summary ? `：${summary}` : ''}`)
  }
  llmsLines.push('')
}

fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsLines.join('\n') + '\n', 'utf8')

const fullLines = [
  `# ${SITE_NAME} · 全文`,
  '',
  `> 本文件包含站点全部 ${articles.length} 篇文章的完整 Markdown 原文，供大语言模型一次性读取。`,
  `> 分篇版本见 ${SITE_URL}/llms.txt。`,
  ''
]
for (const section of SECTIONS) {
  const owned = articles.filter((doc) => doc.relative.startsWith(section.dir + '/'))
  if (!owned.length) continue
  fullLines.push(`\n# ===== ${section.text} =====\n`)
  for (const doc of owned) {
    fullLines.push(`\n---\n\n## ${doc.title}\n\n原文：${SITE_URL}${toLink(doc.relative)}\n\n${doc.body.trim()}\n`)
  }
}
fs.writeFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), fullLines.join('\n'), 'utf8')

/* ---- 落盘 ---- */
fs.mkdirSync(THEME_DIR, { recursive: true })
fs.writeFileSync(path.join(THEME_DIR, 'summaries.json'), JSON.stringify(summaries, null, 2) + '\n', 'utf8')
fs.writeFileSync(path.join(THEME_DIR, 'related.json'), JSON.stringify(related, null, 2) + '\n', 'utf8')
fs.writeFileSync(CACHE_FILE, JSON.stringify(nextCache, null, 2) + '\n', 'utf8')

const withSummary = Object.keys(summaries).length
console.log(
  `[gen-ai-meta] 文章 ${articles.length} 篇 · 摘要 ${withSummary} 条` +
    `（手工 ${manualUsed} 条` +
    (AI_KEY ? ` · LLM 新生成 ${llmUsed} 条${llmFailed ? `，失败 ${llmFailed} 条` : ''}` : ' · 未配置 AI_API_KEY') +
    `）` +
    ` · 相关推荐 ${Object.keys(related).length} 组 · llms.txt / llms-full.txt / md 镜像已生成`
)
