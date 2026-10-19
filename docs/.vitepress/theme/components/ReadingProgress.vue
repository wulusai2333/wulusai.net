<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'

const { frontmatter } = useData()
const percent = ref(0)

/** 首页 / 独立页不显示进度条 */
const visible = computed(
  () => frontmatter.value.layout !== 'home' && frontmatter.value.layout !== 'page'
)

function update() {
  const el = document.documentElement
  const max = el.scrollHeight - el.clientHeight
  percent.value = max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0
}

onMounted(() => {
  update()
  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
})

onUnmounted(() => {
  window.removeEventListener('scroll', update)
  window.removeEventListener('resize', update)
})
</script>

<template>
  <div v-show="visible" class="wl-progress" aria-hidden="true">
    <span class="wl-progress__bar" :style="{ transform: `scaleX(${percent / 100})` }" />
  </div>
</template>
