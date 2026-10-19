<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'

/**
 * Mermaid 图表渲染。
 * 刻意不做全局静态引入 —— mermaid 体积很大（含 katex / cytoscape / 各类图表模块），
 * 只在真正出现图表的页面、且在浏览器端才动态加载，
 * 避免把几百 KB 的依赖塞进每个页面的首屏预加载列表。
 */
const props = defineProps<{ code: string }>()

const { isDark } = useData()
const el = ref<HTMLElement | null>(null)
const svg = ref('')
const failed = ref(false)

let seq = 0

async function render() {
  const source = decodeURIComponent(props.code || '')
  if (!source) return

  try {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark.value ? 'dark' : 'default',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      securityLevel: 'loose'
    })
    const id = `wl-mermaid-${Date.now()}-${seq++}`
    const { svg: out } = await mermaid.render(id, source)
    svg.value = out
    failed.value = false
  } catch {
    failed.value = true
  }
}

onMounted(render)
watch(isDark, render)
</script>

<template>
  <div class="wl-mermaid">
    <div v-if="svg" class="wl-mermaid__canvas" v-html="svg" />
    <pre v-else-if="failed" class="wl-mermaid__fallback"><code>{{ decodeURIComponent(code) }}</code></pre>
    <div v-else class="wl-mermaid__loading">图表加载中…</div>
  </div>
</template>
