<script setup lang="ts">
/**
 * 文章底部：AI 工具条 + 相关文章
 * ----------------------------------------------------------------------------
 * 三件事，全部不需要后端：
 *   1. 复制 Markdown —— 取构建期产出的 /md/ 纯文本镜像；取不到就退回页面正文
 *   2. 复制给 AI 的提问模板 —— 标题 + 永久链接 + 一句引导
 *   3. 在 DeepSeek 打开 —— 只是个普通外链（对话站点不支持 URL 预填提问）
 * 再加一份基于 TF-IDF 的相关文章推荐，数据同样来自构建期。
 */
import { computed, ref } from 'vue'
import { useData } from 'vitepress'
import related from '../related.json'

interface RelatedItem {
  title: string
  url: string
  score: number
}

const { page, frontmatter } = useData()

const title = computed(() => frontmatter.value.title || page.value.title || '')
const absoluteUrl = computed(() => `https://wulusai.net${page.value.relativePath.replace(/\.md$/, '')}`)
const items = computed<RelatedItem[]>(
  () => (related as Record<string, RelatedItem[]>)[page.value.relativePath] ?? []
)

const copied = ref<'' | 'md' | 'prompt'>('')
let resetTimer: ReturnType<typeof setTimeout> | undefined

function flash(kind: 'md' | 'prompt') {
  copied.value = kind
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => (copied.value = ''), 1800)
}

async function copy(text: string, kind: 'md' | 'prompt') {
  try {
    await navigator.clipboard.writeText(text)
    flash(kind)
    return
  } catch {
    /* 非 HTTPS 或权限被拒时退回 execCommand */
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    document.execCommand('copy')
    flash(kind)
  } finally {
    document.body.removeChild(area)
  }
}

/** 优先取构建期生成的 Markdown 镜像，失败则退回页面纯文本 */
async function currentMarkdown(): Promise<string> {
  try {
    const res = await fetch(`/md/${encodeURI(page.value.relativePath)}`)
    if (res.ok) return await res.text()
  } catch {
    /* 忽略，走回退 */
  }
  const doc = document.querySelector('.vp-doc')
  return doc ? (doc as HTMLElement).innerText.trim() : ''
}

async function copyMarkdown() {
  const md = await currentMarkdown()
  if (md) await copy(md, 'md')
}

function copyPrompt() {
  const prompt = [
    `请阅读这篇文章并帮我提炼要点：`,
    ``,
    `标题：${title.value}`,
    `链接：${absoluteUrl.value}`,
    ``,
    `如果无法访问链接，我会把正文粘贴给你。请重点说明：它解决什么问题、关键的坑在哪、哪些结论依赖特定版本。`
  ].join('\n')
  copy(prompt, 'prompt')
}
</script>

<template>
  <div class="wl-article-tools">
    <span class="wl-article-tools__label">把这篇带走 →</span>
    <button class="wl-chip" type="button" @click="copyMarkdown">
      {{ copied === 'md' ? '✓ 已复制' : '复制 Markdown' }}
    </button>
    <button class="wl-chip" type="button" @click="copyPrompt">
      {{ copied === 'prompt' ? '✓ 已复制' : '复制 AI 提问模板' }}
    </button>
    <a class="wl-chip" href="https://chat.deepseek.com/" target="_blank" rel="noopener noreferrer">
      在 DeepSeek 打开 ↗
    </a>
    <a class="wl-chip" href="/llms.txt" target="_blank" rel="noopener">llms.txt</a>
  </div>

  <section v-if="items.length" class="wl-related">
    <h3 class="wl-related__title">相关文章</h3>
    <ul class="wl-related__list">
      <li v-for="item in items" :key="item.url">
        <a :href="item.url">
          <span>{{ item.title }}</span>
          <span class="wl-related__score">{{ item.score }}%</span>
        </a>
      </li>
    </ul>
  </section>
</template>
