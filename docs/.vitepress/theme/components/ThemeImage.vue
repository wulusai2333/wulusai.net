<script setup lang="ts">
/**
 * 双主题图片：暗色用 art.src，亮色用 art.srcLight，只渲染当前主题的地址。
 * ----------------------------------------------------------------------------
 * VitePress 的 `useData().isDark` 在 SSR 阶段恒为 false，而本站主视觉默认深色，
 * 所以首帧先按暗色输出，水合后再按真实主题切换；不使用 <picture> 的
 * prefers-color-scheme，否则会跟随系统而不是站点主题。
 */
import { computed, onMounted, ref } from 'vue'
import { useData } from 'vitepress'
import type { Artwork } from '../art-meta'

const props = defineProps<{
  art: Artwork
  eager?: boolean
  alt?: string
  /** 传给 <img> 的 class，用来沿用各卡片原有的 img 选择器 */
  imgClass?: string
}>()

const { isDark } = useData()
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const wantLight = computed(() => mounted.value && !isDark.value)
const src = computed(() =>
  wantLight.value && props.art.srcLight ? props.art.srcLight : props.art.src
)
const srcSm = computed(() =>
  wantLight.value && props.art.srcLightSm ? props.art.srcLightSm : props.art.srcSm
)
</script>

<template>
  <picture class="wl-picture">
    <source v-if="srcSm" media="(max-width: 900px)" :srcset="srcSm" />
    <img
      :class="imgClass"
      :src="src"
      :alt="alt ?? art.alt"
      :width="art.w"
      :height="art.h"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : 'auto'"
      decoding="async"
    />
  </picture>
</template>
