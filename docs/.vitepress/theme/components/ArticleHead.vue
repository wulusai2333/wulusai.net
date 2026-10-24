<script setup lang="ts">
/**
 * 文章页头图区（doc-top）
 * ----------------------------------------------------------------------------
 * 版式：一张完整的分区封面 → 图录编号 → 衬线大标题 → 日期 / 字数 / 阅读时长。
 *
 * 数据来源（全部构建期可得，运行时不发请求）：
 *   · 分区名与图标：.vitepress/sections.json（经 recent.json 透出）
 *   · 封面图：按目录名从 art-meta 的 sectionArt 取；frontmatter `cover` 可覆盖，
 *     `cover: false` 可以关掉封面只留标题区（比如某些纯文字笔记）
 *   · 日期 / 字数 / 时长：scripts/gen-recent.mjs 生成到 recent.json 的 docs 表
 *
 * 标题只在这里渲染一次：正文里手写的 `# 标题` 由 article.css 隐藏掉，
 * 避免同一个标题在页面上出现两遍。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useData } from 'vitepress'
import stats from '../recent.json'
import { sectionArt, aboutArt, type Artwork } from '../art-meta'
import ThemeImage from './ThemeImage.vue'

const { page, frontmatter } = useData()

interface SectionCard {
  dir: string
  icon: string
  text: string
  desc: string
  count: number
  link: string
}

interface DocMeta {
  date: string
  chars: number
  minutes: number
}

const sections = stats.sections as SectionCard[]
const docs = (stats as unknown as { docs?: Record<string, DocMeta> }).docs ?? {}

const relative = computed(() => page.value.relativePath ?? '')
const dir = computed(() => (relative.value.includes('/') ? relative.value.split('/')[0] : ''))

const section = computed(() => sections.find((item) => item.dir === dir.value))
const plateNo = computed(() => {
  const i = sections.findIndex((item) => item.dir === dir.value)
  return i === -1 ? '' : String(i + 1).padStart(2, '0')
})

const meta = computed<DocMeta | undefined>(() => docs[relative.value])
const title = computed(() => page.value.title ?? frontmatter.value.title ?? '')

interface Cover {
  /** 分区封面：走 ThemeImage，暗/亮各一套 */
  art?: Artwork
  /** frontmatter 指定的自定义封面：单张，不分主题 */
  src?: string
  alt: string
  caption: string
}

/** 非分区页面的头图来源：按相对路径映射到 art-meta 里对应的组 */
const PAGE_ART: Record<string, Artwork | undefined> = {
  'about.md': aboutArt[0]
}

const cover = computed<Cover | null>(() => {
  const custom = frontmatter.value.cover
  if (custom === false) return null
  if (typeof custom === 'string' && custom.length > 0) {
    return {
      src: custom,
      alt: (frontmatter.value.coverAlt as string) ?? title.value,
      caption: (frontmatter.value.coverCaption as string) ?? '本站素材'
    }
  }
  const art = sectionArt[dir.value] ?? PAGE_ART[relative.value]
  return art ? { art, alt: art.alt, caption: art.caption } : null
})

/* ---- 与正文对齐 + 让右侧目录从头图下面开始 ----
 * doc-top 槽位在 .container 之前，VitePress 的右侧目录是 position: fixed，
 * 默认会压在头图上。这里把头图高度写进 --vp-doc-top-height（VitePress 自己的
 * 定位公式会读取它），再把正文栏的左偏移与宽度量出来，让标题和正文左边缘对齐。
 */
const root = ref<HTMLElement | null>(null)
let observer: ResizeObserver | undefined

function syncMetrics() {
  const el = root.value
  const main = document.querySelector('main.main')
  if (!el) return

  document.documentElement.style.setProperty('--vp-doc-top-height', `${el.offsetHeight - 48}px`)

  if (main) {
    const box = el.getBoundingClientRect()
    const mainBox = main.getBoundingClientRect()
    const inset = Math.max(0, Math.round(mainBox.left - box.left))
    document.documentElement.style.setProperty('--wl-doc-inset', `${inset}px`)
    document.documentElement.style.setProperty('--wl-doc-width', `${Math.round(mainBox.width)}px`)
  }
}

onMounted(() => {
  syncMetrics()
  if (root.value && 'ResizeObserver' in window) {
    observer = new ResizeObserver(() => syncMetrics())
    observer.observe(root.value)
  }
  window.addEventListener('resize', syncMetrics)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', syncMetrics)
})

const words = computed(() => {
  if (!meta.value) return ''
  const n = meta.value.chars
  return n >= 10000 ? `${(n / 10000).toFixed(1)} 万字` : `${n} 字`
})
</script>

<template>
  <header ref="root" class="wl-doc-head" :class="{ 'has-cover': cover, 'is-plain': !cover }">
    <figure v-if="cover" class="wl-doc-head__cover">
      <ThemeImage v-if="cover.art" :art="cover.art" />
      <img v-else :src="cover.src" :alt="cover.alt" width="1200" height="750" decoding="async" />
      <span class="wl-doc-head__veil" aria-hidden="true" />
      <figcaption class="wl-doc-head__plate">
        <b v-if="plateNo">PL. {{ plateNo }}</b>
        <span>{{ cover.caption }}</span>
      </figcaption>
    </figure>

    <div class="wl-doc-head__body">
      <p class="wl-doc-head__eyebrow">
        <span>{{ section?.text ?? 'NOTES' }}</span>
        <span v-if="section?.desc" class="wl-doc-head__desc">{{ section.desc }}</span>
      </p>

      <h1 class="wl-doc-head__title">{{ title }}</h1>

      <p class="wl-doc-head__meta">
        <span v-if="section" class="wl-doc-head__icon" aria-hidden="true">{{ section.icon }}</span>
        <time v-if="meta" :datetime="meta.date">{{ meta.date }}</time>
        <span v-if="meta">{{ words }} · 约 {{ meta.minutes }} 分钟</span>
        <span class="wl-doc-head__meta-rule" aria-hidden="true" />
        <span>{{ section ? section.count + ' 篇同区笔记' : '私人笔记' }}</span>
      </p>
    </div>
  </header>
</template>
