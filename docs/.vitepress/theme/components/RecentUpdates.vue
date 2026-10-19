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
  <section class="wl-recent">
    <header class="wl-section-head">
      <h2>最近更新</h2>
      <p>构建时自动读取 Git 提交记录生成，不用手写</p>
    </header>

    <ul class="wl-recent__list">
      <li v-for="item in items" :key="item.url">
        <a :href="item.url">
          <span class="wl-recent__icon">{{ item.icon }}</span>
          <span class="wl-recent__title">{{ item.title }}</span>
          <span class="wl-recent__section">{{ item.section }}</span>
          <time class="wl-recent__date">{{ item.date }}</time>
        </a>
      </li>
    </ul>
  </section>
</template>
