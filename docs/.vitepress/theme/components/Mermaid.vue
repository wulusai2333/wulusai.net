<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'

/**
 * Mermaid 图表渲染。
 *
 * 三个刻意的设计：
 * 1. 「动态」引入 mermaid —— 它体积很大（含 katex / cytoscape / 各类图表模块），
 *    只有真的出现图表的页面才加载，不拖慢全站首屏。
 * 2. 用 mermaid.run() 而不是 mermaid.render() —— 渲染发生在页面上真实存在的
 *    节点里，避开 render() 找不到承载元素时的 firstChild 报错。
 * 3. 渲染串行化 —— mermaid 内部共用一份状态，同页多个图表并发渲染会互相干扰。
 */
const props = defineProps<{ code: string }>()

const { isDark } = useData()
const el = ref<HTMLElement | null>(null)
const failed = ref(false)
const errorText = ref('')

interface MermaidApi {
  initialize: (config: Record<string, unknown>) => void
  run: (options: { nodes: HTMLElement[] }) => Promise<void>
}

let mermaidApi: MermaidApi | null = null
let initializedTheme: string | null = null
let queue: Promise<void> = Promise.resolve()

async function getMermaid(theme: string): Promise<MermaidApi> {
  if (!mermaidApi) {
    const mod = await import('mermaid')
    mermaidApi = (mod.default ?? mod) as unknown as MermaidApi
  }
  if (initializedTheme !== theme) {
    mermaidApi.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    })
    initializedTheme = theme
  }
  return mermaidApi
}

async function renderNow() {
  const node = el.value
  const source = decodeURIComponent(props.code || '')
  if (!node || !source.trim()) return

  try {
    const api = await getMermaid(isDark.value ? 'dark' : 'default')
    // 重新渲染前复位，让 run() 重新解析这个节点
    node.removeAttribute('data-processed')
    node.textContent = source
    await api.run({ nodes: [node] })
    failed.value = false
    errorText.value = ''
  } catch (err) {
    failed.value = true
    errorText.value = err instanceof Error ? err.message.split('\n')[0] : String(err)
    node.textContent = ''
  }
}

function schedule() {
  queue = queue.then(renderNow, renderNow)
}

onMounted(schedule)

watch(isDark, () => {
  failed.value = false
  errorText.value = ''
  schedule()
})
</script>

<template>
  <div class="wl-mermaid">
    <div ref="el" class="wl-mermaid__canvas" />
    <pre v-if="failed" class="wl-mermaid__fallback"><code>{{ decodeURIComponent(code) }}</code></pre>
    <p v-if="failed && errorText" class="wl-mermaid__error">渲染失败：{{ errorText }}</p>
  </div>
</template>
