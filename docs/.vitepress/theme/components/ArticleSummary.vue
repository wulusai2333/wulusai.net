<script setup lang="ts">
/**
 * 文章顶部「一句话速览」
 * ----------------------------------------------------------------------------
 * 数据来自构建期生成的 theme/summaries.json：
 *   · 配了 AI_API_KEY 的文章 → by === 'llm'，标签显示「AI 摘要」
 *   · 没配                    → 抽取式摘要，标签老老实实写「速览」
 * 宁可标得保守，也不把抽取出来的原文冒充成模型生成的。
 */
import { computed } from 'vue'
import { useData } from 'vitepress'
import summaries from '../summaries.json'

interface Summary {
  text: string
  /** manual = 入库的人工/离线模型摘要；llm = 构建时实时生成；extract = 抽取式兜底 */
  by: 'manual' | 'llm' | 'extract'
}

const { page } = useData()

const summary = computed<Summary | null>(() => {
  const table = summaries as Record<string, Summary>
  const hit = table[page.value.relativePath]
  return hit?.text ? hit : null
})

const label = computed(() => (summary.value?.by === 'extract' ? '速览' : 'AI 摘要'))
</script>

<template>
  <div v-if="summary" class="wl-tldr">
    <span class="wl-tldr__tag">{{ label }}</span>{{ summary.text }}
  </div>
</template>
