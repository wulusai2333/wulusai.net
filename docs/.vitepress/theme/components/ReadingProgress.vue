<script setup lang="ts">
/**
 * 阅读进度条
 * ----------------------------------------------------------------------------
 * 顶部 3px 渐变进度条，右端跟一只小鲸鱼：它随进度横向游动，
 * 并保持摆尾的小动画，让「读到哪了」这件事变得有意思一点。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'

const { frontmatter } = useData()
const percent = ref(0)

/** 首页 / 独立页不显示进度条 */
const visible = computed(
  () => frontmatter.value.layout !== 'home' && frontmatter.value.layout !== 'page'
)

let raf = 0

function measure() {
  const el = document.documentElement
  const max = el.scrollHeight - el.clientHeight
  percent.value = max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0
}

/** 滚动事件用 rAF 节流，避免高频读取 scrollTop 造成抖动 */
function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    measure()
  })
}

onMounted(() => {
  measure()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <div v-show="visible" class="wl-progress" aria-hidden="true">
    <span class="wl-progress__bar" :style="{ transform: `scaleX(${percent / 100})` }" />
    <span class="wl-progress__whale" :style="{ left: `${percent}%` }" />
  </div>
</template>
