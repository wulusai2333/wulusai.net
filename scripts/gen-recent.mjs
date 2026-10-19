/**
 * 首页数据生成器
 * ---------------------------------------------------------------
 * 在 `pnpm dev` / `pnpm build` 之前自动运行，产出 theme/recent.json：
 *   · sections —— 各分类的篇数（驱动首页分类卡片）
 *   · recent   —— 最近更新的文章（读取 Git 提交时间，按时间倒序）
 *   · totalDocs / totalChars —— 站点总篇数与总字数
 *
 * 分类顺序、图标、标题覆盖全部来自 .vitepress/sections.json，
 * 与侧边栏共用同一份配置，不会出现两边不一致。
 *
 * 拿不到 Git 信息时（例如浅克隆）自动回退到文件修改时间。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DOCS_ROOT = path.resolve(HERE, '../docs')
const REPO_ROOT = path.resolve(HERE, '..')
const OUT_FILE = path.join(DOCS_ROOT, '.vitepress/theme/recent.json')

const { sections: SECTIONS, titles: TITLES } = JSON.parse(
  fs.readFileSync(path.join(DOCS_ROOT, '.vitepress/sections.json'), 'utf8')
)

const RECENT_LIMIT = 6

/** 递归收集 markdown，跳过 en 与隐藏目录 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (full === path.join(DOCS_ROOT, 'en')) continue
      walk(full, out)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

function rel(abs) {
  return path.relative(DOCS_ROOT, abs).split(path.sep).join('/')
}

function toLink(relative) {
  return '/' + relative.replace(/\.md$/, '')
}

/** 读取一级标题，跳过 frontmatter 与代码块 */
function firstHeading(text) {
  let raw = text
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3)
    if (end !== -1) raw = raw.slice(raw.indexOf('\n', end + 1) + 1)
  }
  let inFence = false
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^#\s+(.+?)\s*$/.exec(line)
    if (match) return match[1].replace(/[#*`]/g, '').trim()
  }
  return undefined
}

/**
 * 用一条 git 命令取出所有文件最近一次提交时间。
 * git log 输出顺序为新→旧，首次出现的路径即最近修改时间。
 */
function gitDates() {
  const map = new Map()
  try {
    const out = execFileSync(
      'git',
      [
        '-C',
        REPO_ROOT,
        // 关键：默认 core.quotePath=true 会把中文路径转义成 \xxx 形式导致匹配不上
        '-c',
        'core.quotePath=false',
        'log',
        '--pretty=format:__C__%cI',
        '--name-only',
        '--no-renames',
        '--',
        'docs'
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    let current = null
    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith('__C__')) {
        current = line.slice(5).trim()
        continue
      }
      const file = line.trim()
      if (!file || !current) continue
      if (file.startsWith('docs/') && file.endsWith('.md')) {
        const key = file.slice('docs/'.length)
        if (!map.has(key)) map.set(key, current)
      }
    }
  } catch {
    // 忽略：回退到文件修改时间
  }
  return map
}

const git = gitDates()
const files = walk(DOCS_ROOT)
  .filter((abs) => rel(abs).includes('/')) // 排除 index.md / about.md 这类站点页面
  .sort()

const entries = files.map((abs) => {
  const relative = rel(abs)
  const text = fs.readFileSync(abs, 'utf8')
  const date = git.get(relative) ?? fs.statSync(abs).mtime.toISOString()
  return {
    relative,
    text,
    chars: text.replace(/\s/g, '').length,
    date
  }
})

/** 分类统计 */
const sectionCards = SECTIONS.map((section) => {
  const prefix = section.dir + '/'
  const owned = entries.filter((e) => e.relative.startsWith(prefix))
  const first = (section.order ?? []).map((p) => owned.find((e) => e.relative === p)).find(Boolean) ?? owned[0]
  return {
    icon: section.icon,
    text: section.text,
    desc: section.desc,
    count: owned.length,
    link: first ? toLink(first.relative) : '/'
  }
}).filter((s) => s.count > 0)

const sectionOf = (relative) => {
  const hit = SECTIONS.find((s) => relative.startsWith(s.dir + '/'))
  return hit ?? { icon: '📄', text: '其他' }
}

/** 最近更新（跳过占位空文件与首页） */
const recent = entries
  .filter((e) => e.chars > 0)
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .slice(0, RECENT_LIMIT)
  .map((e) => {
    const section = sectionOf(e.relative)
    return {
      title: TITLES[e.relative] ?? firstHeading(e.text) ?? path.basename(e.relative, '.md'),
      url: toLink(e.relative),
      date: new Date(e.date).toISOString().slice(0, 10),
      section: section.text,
      icon: section.icon
    }
  })

const payload = {
  generatedAt: new Date().toISOString(),
  totalDocs: entries.length,
  totalChars: entries.reduce((sum, e) => sum + e.chars, 0),
  sections: sectionCards,
  recent
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8')

console.log(
  `[gen-recent] 分类 ${sectionCards.length} 个 · 文档 ${payload.totalDocs} 篇 · ${(
    payload.totalChars / 10000
  ).toFixed(1)} 万字 · 最近更新 ${recent.length} 条`
)
