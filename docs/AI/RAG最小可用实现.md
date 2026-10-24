---
title: RAG 最小可用实现
---

最小 RAG 的全部内容是五步：**切块 → 算向量 → 存下来 → 检索 → 拼进提示词**。不用向量数据库，因为几十到几千个块用暴力余弦就够了。这篇的重点不是把这五步写出来，而是**每一步会怎么坏**。

## 最短路径

1. **切块**：按段落/标题切，目标 200–500 token 一块，相邻块留 10%–15% 重叠。
2. **算向量**：调 embedding 接口（本地 Ollama 或云端 OpenAI 兼容接口都行）。
3. **存文件**：一个 JSON 数组就够，每项是 `{ 文本, 来源, 向量 }`。
4. **检索**：查询也算一个向量，和所有块算余弦相似度，取 top-k。
5. **拼接**：按「来源 + 序号 + 原文」放进提示词，**并给模型一个「没找到就说没有」的出口**。

::: tip 先别上向量库
向量数据库解决的是「几百万向量、要低延迟、要过滤条件」的问题。个人知识库通常几千个块 —— 全部读进内存算一次余弦也就是几十毫秒。**先跑通最小版本，等真的被规模卡住再换。**
:::

## 整体形状

```text
文档 → 切块 → embedding 接口 → index.json ┐
                                          ├→ 余弦检索 → top-k → 拼提示词 → 聊天接口
问题 ─────────→ embedding 接口 ───────────┘
```

关键认识：**检索和生成是两个独立故障源**。答不对时先分清是「没检索到」（召回）还是「检索到了没用上」（提示词/生成）—— 修法完全不同。

## 依赖与版本

这份实现**刻意不引入任何第三方依赖**，只用 Node 内置能力：Node.js **20+**（需要全局 `fetch`），不需要向量库、不需要 SDK、不需要 `npm install`。

```bash
mkdir -p ~/rag-demo && cd ~/rag-demo   # 四份文件：chunk.mjs / embed.mjs / index.mjs / search.mjs + ask.mjs
```

::: warning 未验证声明
下面的脚本我**没有在本机运行过**（没有可用的 embedding 接口环境）。代码是按接口的公开形状写的，逻辑是自包含的，但**请当成「待你验证的骨架」而不是「复制即用的成品」**。
:::

## 第 1 步：切块

```js
// chunk.mjs —— 按空行分段，再按长度合并/切分
const norm = (t) => t.replace(/\r\n?/g, '\n').trim() // 换行符必须先统一，否则同一份文本会切出不同的块

export function chunkText(text, { size = 480, overlap = 60 } = {}) {
  const paras = norm(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks = []

  for (const p of paras) {
    // 单段就超长：直接按窗口切（带 overlap）
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size - overlap) chunks.push(p.slice(i, i + size))
      continue
    }
    const last = chunks.at(-1)
    // 填得下就接着上一块；否则开新块，把上一块尾巴 overlap 过来避免答案被切断
    if (last && last.length + p.length + 2 <= size) chunks[chunks.length - 1] = last + '\n\n' + p
    else chunks.push((last ? last.slice(-overlap) + '\n\n' : '') + p)
  }

  return chunks.map((c) => c.trim()).filter(Boolean)
}
```

### 切块大小的取舍

| | 问题 |
| --- | --- |
| **块太小** | 一块不足以回答问题；命中很多块但每块都不完整 |
| **块太大** | 多个主题混在一起，向量被「平均」掉反而谁都匹配不上；拼进提示词容易超长度 |

经验区间（**量级参考，未验证**）：**200–500 token 一块，10%–15% 重叠**。

::: warning 中文的字数 ≠ token 数
中文在有些 tokenizer 下大约 **1 token ≈ 1.5–2 个汉字**，另一些下接近 **1:1**（量级参考，未验证）—— **别凭字数猜，用你实际用的接口量一次**。
:::

**两个便宜的改进，效果比调参明显**：把**标题路径拼到每块最前面**（否则「这块在讲什么」会丢）；**每块记住来源文件和序号**（生成阶段给模型，模型能引用、你也能核对）。

## 第 2 步：算向量

两条路线用环境变量切换：**OpenAI 兼容接口**和**本地 Ollama**。

```js
// embed.mjs —— 只依赖 Node 20+ 的全局 fetch
const post = (url, body, headers = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })

// 路线 A：OpenAI 兼容接口（返回 { data: [{ embedding }] }）
async function embedOpenAI(texts) {
  const res = await post(`${process.env.EMBED_BASE_URL}/embeddings`, {
    model: process.env.EMBED_MODEL,
    input: texts
  }, { authorization: `Bearer ${process.env.EMBED_API_KEY}` }) // 环境变量传，别硬编码
  if (!res.ok) throw new Error(`embeddings HTTP ${res.status}: ${await res.text()}`)
  return (await res.json()).data.map((d) => d.embedding)
}

// 路线 B：本地 Ollama（POST /api/embed，返回 { embeddings: [[...]] }）
async function embedOllama(texts) {
  const host = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434'
  const res = await post(`${host}/api/embed`, { model: process.env.EMBED_MODEL, input: texts })
  if (!res.ok) throw new Error(`ollama embed HTTP ${res.status}: ${await res.text()}`)
  return (await res.json()).embeddings
}

export async function embed(texts, { backend = 'openai' } = {}) {
  const fn = backend === 'ollama' ? embedOllama : embedOpenAI
  const out = []
  const BATCH = 64 // 批太大容易触发请求超时；太小则请求数爆炸
  for (let i = 0; i < texts.length; i += BATCH) out.push(...(await fn(texts.slice(i, i + BATCH))))
  return out
}
```

::: danger 文档和查询必须用同一个 embedding 模型
换了模型（或者同一个模型换了维度参数）**必须重建整个索引**。混着用不会报错，只会让检索结果变成噪声 —— 这是最难查的一类问题，因为表面上一切正常。**做法**：把模型名和维度写进索引文件，加载时校验，不一致就直接报错退出。
:::

## 第 3 步：存下来

```js
// index.mjs —— 读 ./docs 下的 .md，切块、算向量、存成 JSON
import fs from 'node:fs/promises'
import path from 'node:path'
import { chunkText } from './chunk.mjs'
import { embed } from './embed.mjs'

const SRC = process.env.SRC_DIR ?? './docs'
const OUT = process.env.INDEX_FILE ?? './index.json'

async function walk(dir) {
  const files = await Promise.all(
    (await fs.readdir(dir, { withFileTypes: true })).map((e) => {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) return walk(full)
      return e.name.endsWith('.md') ? [full] : []
    })
  )
  return files.flat()
}

const records = []
for (const file of await walk(SRC)) {
  const raw = await fs.readFile(file, 'utf8')
  const text = raw.replace(/^---[\s\S]*?---\n/, '') // 去掉 frontmatter
  for (const [i, chunk] of chunkText(text).entries()) records.push({ text: chunk, source: file, seq: i })
}

const vectors = await embed(records.map((r) => r.text), {
  backend: process.env.EMBED_BACKEND ?? 'openai'
})
vectors.forEach((v, i) => { records[i].vector = v })

// meta 里存下模型名和维度：换了模型就必须重建，不能默默混用
await fs.writeFile(OUT, JSON.stringify({
  meta: { model: process.env.EMBED_MODEL, dim: vectors[0]?.length ?? 0 },
  records
}, null, 0))

console.log(`[index] ${records.length} 个块，维度 ${vectors[0]?.length}`)
```

```bash
EMBED_BACKEND=ollama EMBED_MODEL=bge-m3 SRC_DIR=~/project/notes node index.mjs
```

::: tip 存 JSON 就够，但注意两件事
1. **向量用 float 数组存会很大**：1000 个块 × 1024 维 float32 就是几 MB 到十几 MB（量级参考，未验证）—— 能接受；涨到十几万块再考虑二进制格式或向量库。
2. **块文本和来源必须留在索引里**，不能只存向量和文件路径 —— 文档一改，路径指向的内容就对不上了。
:::

## 第 4 步：检索

```js
// search.mjs —— 读索引、算余弦、取 top-k
import fs from 'node:fs/promises'
import { embed } from './embed.mjs'

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

export async function search(query, { topK = 5, minScore = 0.3 } = {}) {
  const index = JSON.parse(await fs.readFile(process.env.INDEX_FILE ?? './index.json', 'utf8'))
  const [qv] = await embed([query], { backend: process.env.EMBED_BACKEND ?? 'openai' })

  if (qv.length !== index.meta.dim) {
    throw new Error(`维度不匹配：索引 ${index.meta.dim}，查询 ${qv.length}。两边用的不是同一个模型。`)
  }

  return index.records
    .map((r) => ({ ...r, score: cosine(qv, r.vector) }))
    .filter((r) => r.score >= minScore) // 关键：不设阈值，就一定会把无关内容塞进提示词
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
```

**为什么可以暴力算**：几千个块 × 1024 维就是百万级乘加运算，百毫秒内。**向量库的价值在规模和过滤，不在「余弦算得快」。**

## 第 5 步：拼进提示词

这一步是「检索到了但答不对」的**主要**原因。

```js
// ask.mjs —— 检索 + 拼提示词 + 调聊天接口
import { search } from './search.mjs'

const question = process.argv.slice(2).join(' ')
const hits = await search(question)

// 用明确的分隔符隔开片段，否则模型会跨片段混着读
const contextBlock = hits
  .map((h, i) => `[片段 ${i + 1}] 来源：${h.source}（第 ${h.seq} 块）\n${h.text}`)
  .join('\n\n---\n\n')

const prompt = `请只依据下面的【资料】回答问题。

规则：
1. 资料里没有的内容，直接回答「资料中没有相关信息」，不要凭常识补充。
2. 回答时用 [片段 N] 标注依据来自哪一段。
3. 如果多个片段冲突，把冲突指出来，不要自己选一个。

【资料】
${contextBlock}

【问题】
${question}`

const res = await fetch(`${process.env.CHAT_BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.CHAT_API_KEY}`
  },
  body: JSON.stringify({
    model: process.env.CHAT_MODEL,
    temperature: 0.1, // 事实型问答调低随机性
    messages: [
      { role: 'system', content: '你是严谨的技术资料问答助手。' },
      { role: 'user', content: prompt }
    ]
  })
})

if (!res.ok) throw new Error(`chat HTTP ${res.status}: ${await res.text()}`)
console.log((await res.json()).choices?.[0]?.message?.content ?? '(空回复)')
```

### 为什么「检索到了但答不对」

按发生频率从高到低排：

| 现象 | 真正的原因 | 怎么修 |
| --- | --- | --- |
| 资料里有答案，模型却说没有 | 关键句跨在两个块上，被切断 | 加大重叠；按语义边界切；给块补标题上下文 |
| 模型拿片段里的**无关内容**作答 | 相似度阈值太低，塞进了噪声块 | 设 `minScore`；调小 top-k；加 rerank |
| 答得笼统、不引用来源 | 没说清「依据资料回答」和引用格式 | 提示词里写死规则与引用格式 |
| 编造了资料里没有的结论 | 没有「说不知道」的出口 | 显式规则 1：「资料里没有就直接说没有」 |
| 答案在长资料中间被忽略 | 长上下文的「中间遗忘」效应 | 最相关的块放**最前面**；减少无关块 |
| 混淆了是哪份文档 | 拼接时丢了来源 | 每个片段带上来源文件名与序号 |
| 换个问法就不行 | 查询本身没表达清楚 | 先改写查询再检索；或做多查询合并 |

::: warning 拼接格式本身会影响效果
「检索到了但答不对」很多时候**问题在拼接格式，不在检索准确性**：

- **不要把相似度分数塞给模型**。`score: 0.83` 对生成没帮助，还可能干扰。
- **用明确的分隔符**（`---`、`[片段 N]`）。片段粘连成一坨时，模型会跨片段混着读。
- **不要把 top-10 全塞进去**。无关片段越多，模型越容易挑错重点。
- **最相关的放两头**都比放中间好 —— 详见[提示词与上下文工程](./提示词与上下文工程.md)。
:::

## 关于中文的 embedding 模型选择

| 类型 | 优点 | 缺点 |
| --- | --- | --- |
| **本地开源模型**（BGE 系列等） | 数据不出本机；无 API 成本；离线可用 | 占内存/显存；首次下载慢 |
| **云端 API**（OpenAI 兼容接口） | 省事；不用管显存 | 数据出本机；有费用；断网不可用 |
| **中文专精模型** | 中文检索质量通常明显好于通用英文模型 | 英文/代码场景可能反而更差 |

几条**方向性**结论（**未在本机验证**）：

1. **中文语料优先选在中文上训练过的模型**，别默认拿英文榜单第一的模型直接用。
2. **注意「文档/查询」前缀**。有些模型家族要求两者加不同的指令前缀，**漏加不会报错，只会让效果变差**。
3. **维度不是越高越好**：存储与计算成本更高，质量未必更好。
4. **中英混排要单独看**：只做过中文评测的模型在混排语料上可能掉得厉害。
5. **能本地跑也能调 API 时，优先用同一份权重**：离线与在线的向量空间才一致。

## 边界与取舍

这套东西**不够用**的时候：

- **需要过滤条件**（按时间、标签、权限）→ 得自己写过滤，或上支持元数据过滤的向量库。
- **块数到几十万以上** → 内存装不下所有向量、线性扫描也开始变慢，该上向量库 + 近似最近邻。
- **需要高准确率的事实问答** → 检索后加一层 **rerank**（交叉编码器重排 top-50 再取 top-5），投入产出比最高的一步增强。
- **文档更新频繁** → 需要增量重建策略，而不是每次全量重算。

参考：[Ollama Embeddings API](https://github.com/ollama/ollama/blob/main/docs/api.md)。我的取舍结论：

1. **先跑通「JSON 索引 + 暴力余弦」**，再谈向量库。
2. **切块和提示词拼接的收益，远大于换 embedding 模型。**
3. **给模型「说不知道」的出口不是可选项**，否则 RAG 只是把幻觉来源从模型内部换成了你的资料。
4. **`minScore` 应当当成必需参数**：检索永远会返回 top-k，哪怕全是垃圾。
