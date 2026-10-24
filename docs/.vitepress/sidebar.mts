import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sectionsConfig from './sections.json'

/**
 * 侧边栏自动生成器
 * ---------------------------------------------------------------
 * 设计目标：把「维护目录」从手工清单变成零成本。
 *
 * · 新增一篇 .md 丢进分类目录 → 侧边栏自动出现，不用改任何配置
 * · 想调顺序或起更好看的标题 → 只改 sections.json 一个文件
 *   （首页的分类统计、最近更新也读同一个文件，不会两边打架）
 * · 没登记的标题会自动读文章一级标题（跳过代码块，避免把 shell 注释当标题）
 * · 目录里新出现的分类文件夹也会自动成为新分组
 */

export interface SidebarItem {
  text: string
  link: string
}

export interface SidebarGroup {
  text: string
  collapsed?: boolean
  items: SidebarItem[]
}

interface SectionConfig {
  dir: string
  icon: string
  text: string
  desc?: string
  collapsed?: boolean
  order?: string[]
}

const { sections: SECTIONS, titles: TITLES } = sectionsConfig as {
  sections: SectionConfig[]
  titles: Record<string, string>
}

/** 文档根目录（docs/） */
const DOCS_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 递归收集目录下的全部 markdown */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

/**
 * 取文章一级标题。
 * 先剥掉 frontmatter 和围栏代码块，避免把 `# 这是 shell 注释` 当成标题。
 */
export function firstHeading(file: string): string | undefined {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return undefined
  }

  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3)
    if (end !== -1) raw = raw.slice(raw.indexOf('\n', end + 1) + 1)
  }

  let insideFence = false
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      insideFence = !insideFence
      continue
    }
    if (insideFence) continue
    const match = /^#\s+(.+?)\s*$/.exec(line)
    if (match) return match[1].replace(/[#*`]/g, '').trim()
  }
  return undefined
}

function toLink(relPath: string): string {
  // index.md 指向目录本身，否则链接会变成 /AI/index 这种多余的形态
  return (
    '/' +
    relPath
      .split(path.sep)
      .join('/')
      .replace(/\.md$/, '')
      .replace(/(^|\/)index$/, '$1')
  )
}

function buildGroup(section: SectionConfig): SidebarGroup | undefined {
  const abs = path.join(DOCS_ROOT, section.dir)
  if (!fs.existsSync(abs)) return undefined

  const files = walk(abs)
    .map((f) => path.relative(DOCS_ROOT, f).split(path.sep).join('/'))
    .sort()

  if (files.length === 0) return undefined

  const order = section.order ?? []
  const ordered = order.map((p) => files.find((f) => f === p)).filter((f): f is string => !!f)
  const rest = files
    .filter((f) => !ordered.includes(f))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

  const items: SidebarItem[] = [...ordered, ...rest].map((rel) => ({
    text: TITLES[rel] ?? firstHeading(path.join(DOCS_ROOT, rel)) ?? path.basename(rel, '.md'),
    link: toLink(rel)
  }))

  return { text: `${section.icon} ${section.text}`, collapsed: section.collapsed ?? true, items }
}

/** 中文（默认语言）侧边栏 */
export function generateSidebar(): SidebarGroup[] {
  const groups: SidebarGroup[] = []
  const used = new Set(SECTIONS.map((s) => s.dir))

  for (const section of SECTIONS) {
    const group = buildGroup(section)
    if (group) groups.push(group)
  }

  // 目录里新出现的分类自动补分组，无需改配置
  const autoDirs = fs
    .readdirSync(DOCS_ROOT, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith('.') &&
        !used.has(e.name) &&
        e.name !== 'en' &&
        e.name !== 'public'
    )
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

  for (const dir of autoDirs) {
    const group = buildGroup({ dir, icon: '📁', text: dir })
    if (group) groups.push(group)
  }

  return groups
}

/** 英文分区的侧边栏 */
export function generateSidebarEn(): SidebarGroup[] {
  const root = path.join(DOCS_ROOT, 'en')
  if (!fs.existsSync(root)) return []

  const items: SidebarItem[] = walk(root)
    .map((f) => path.relative(DOCS_ROOT, f).split(path.sep).join('/'))
    .sort()
    .map((rel) => ({
      text: firstHeading(path.join(DOCS_ROOT, rel)) ?? path.basename(rel, '.md'),
      link: toLink(rel)
    }))

  return items.length ? [{ text: 'Documentation', collapsed: false, items }] : []
}
