<script setup lang="ts">
import stats from '../recent.json'

interface RecentItem {
  title: string
  url: string
  date: string
  section: string
  icon: string
}

const items = stats.recent as RecentItem[]
</script>

<template>
  <section id="recent" class="wl-recent wl-section" aria-labelledby="wl-recent-title">
    <div class="wl-head">
      <div>
        <p class="wl-eyebrow"><span>05 / RECENTLY</span><span class="wl-eyebrow__meta">构建时自动生成</span></p>
        <h2 id="wl-recent-title" class="wl-display">最近更新</h2>
        <p class="wl-head__desc">按 Git 提交时间倒序，不手写。</p>
      </div>
      <p class="wl-recent__note">持续整理中<br /><span>{{ stats.generatedAt.slice(0, 10) }}</span></p>
    </div>

    <ol class="wl-recent__list">
      <li v-for="(item, i) in items" :key="item.url">
        <a :href="item.url">
          <span class="wl-recent__no">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="wl-recent__icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="wl-recent__title">{{ item.title }}</span>
          <span class="wl-recent__section">{{ item.section }}</span>
          <time class="wl-recent__date" :datetime="item.date">{{ item.date }}</time>
          <span class="wl-recent__arrow" aria-hidden="true">↗</span>
        </a>
      </li>
    </ol>
  </section>
</template>
