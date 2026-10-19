<script setup lang="ts">
import stats from '../recent.json'

interface SectionCard {
  icon: string
  text: string
  desc: string
  count: number
  link: string
}

const cards = stats.sections as SectionCard[]
</script>

<template>
  <section class="wl-categories">
    <header class="wl-section-head">
      <h2>知识分类</h2>
      <p>按主题整理的笔记，点进去就是全部</p>
    </header>

    <div class="wl-cards">
      <a v-for="card in cards" :key="card.text" class="wl-card" :href="card.link">
        <span class="wl-card__glow" aria-hidden="true" />
        <span class="wl-card__icon">{{ card.icon }}</span>
        <span class="wl-card__body">
          <span class="wl-card__title">
            {{ card.text }}
            <em>{{ card.count }} 篇</em>
          </span>
          <span class="wl-card__desc">{{ card.desc }}</span>
        </span>
        <span class="wl-card__arrow" aria-hidden="true">→</span>
      </a>
    </div>
  </section>
</template>
