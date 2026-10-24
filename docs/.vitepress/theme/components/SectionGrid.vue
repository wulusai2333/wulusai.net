<script setup lang="ts">
/**
 * 知识分区：13 张图像卡，首卡放大占据 2×2，其余按 4 列铺满。
 * 图片来自 theme/art-meta.ts 的 section 组；篇数与链接来自构建期 recent.json。
 */
import stats from '../recent.json'
import { sectionArt } from '../art-meta'
import ThemeImage from './ThemeImage.vue'

interface SectionCard {
  dir: string
  icon: string
  text: string
  desc: string
  count: number
  link: string
}

const cards = (stats.sections as SectionCard[]).map((card) => ({
  ...card,
  art: sectionArt[card.dir]
}))
</script>

<template>
  <section id="sections" class="wl-sections wl-section" aria-labelledby="wl-sections-title">
    <div class="wl-head">
      <div>
        <p class="wl-eyebrow"><span>03 / THE CATALOGUE</span><span class="wl-eyebrow__meta">{{ stats.totalDocs }} 篇 · {{ cards.length }} 区</span></p>
        <h2 id="wl-sections-title" class="wl-display">知识分区</h2>
        <p class="wl-head__desc">按主题归档，不按时间。每个分区一张封面，点进去就是全部笔记。</p>
      </div>
    </div>

    <div class="wl-sections__grid">
      <a
        v-for="(card, i) in cards"
        :key="card.dir"
        class="wl-section-card"
        :class="{ 'is-feature': i === 0 }"
        :href="card.link"
        :style="{ '--card-tint': card.art?.color || '#101a33' }"
      >
        <ThemeImage
          v-if="card.art"
          :art="card.art"
          img-class="wl-section-card__img"
        />
        <span class="wl-section-card__veil" aria-hidden="true" />
        <span class="wl-section-card__top">
          <b>{{ String(i + 1).padStart(2, '0') }}</b>
          <span class="wl-section-card__icon" aria-hidden="true">{{ card.icon }}</span>
        </span>
        <span class="wl-section-card__body">
          <strong>{{ card.text }}</strong>
          <em>{{ card.desc }}</em>
          <span class="wl-section-card__meta">{{ card.count }} 篇 <i aria-hidden="true">→</i></span>
        </span>
      </a>
    </div>
  </section>
</template>
