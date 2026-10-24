<script setup lang="ts">
/**
 * 首页主视觉：一层会呼吸的画。
 * ----------------------------------------------------------------------------
 * 三张横版插画做 8 秒一次的交叉淡入，叠一层极慢的推近。文字压在左下，
 * 图录编号、当前画名、站点坐标固定在底部 —— 像展览入口的展签。
 *
 * 取舍：
 *  · 不做视频。三张静帧的交叉淡入 + 轻微 Ken Burns，比视频轻两个数量级，
 *    也更符合「翻阅图录」的气质。
 *  · 只让第一张 eager；后两张 lazy，避免首屏一次抢 600KB。
 *  · prefers-reduced-motion 时停在第一张，不做任何位移。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import StarField from './StarField.vue'
import ThemeImage from './ThemeImage.vue'
import { heroArt } from '../art-meta'
import stats from '../recent.json'

const active = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

const current = computed(() => heroArt[active.value] ?? heroArt[0])

onMounted(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) return
  timer = setInterval(() => {
    if (document.hidden) return
    active.value = (active.value + 1) % heroArt.length
  }, 8000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="wl-hero" aria-labelledby="wl-hero-title">
    <div class="wl-hero__media" aria-hidden="true">
      <figure
        v-for="(art, i) in heroArt"
        :key="art.id"
        class="wl-hero__slide"
        :class="{ 'is-active': active === i }"
      >
        <ThemeImage :art="art" :eager="i === 0" alt="" />
      </figure>
      <StarField />
      <span class="wl-hero__tint" />
      <span class="wl-hero__grain" />
    </div>

    <div class="wl-hero__inner">
      <header class="wl-hero__copy">
        <p class="wl-eyebrow wl-eyebrow--light">
          <span>WULUSAI · KNOWLEDGE ATLAS</span>
          <span class="wl-eyebrow__meta">EST. 2026</span>
        </p>

        <h1 id="wl-hero-title" class="wl-hero__title">
          <span>把踩过的坑</span>
          <span class="wl-hero__title-em">写成能查的文档<i>。</i></span>
        </h1>

        <p class="wl-hero__lede">
          Java / Linux / 数据库 / AI 绘画 —— 一个程序员的私人笔记站。<br />
          想到哪写到哪，写错了就改。
        </p>

        <div class="wl-hero__actions">
          <a class="wl-btn wl-btn--solid" href="/Java/设计模式">
            开始阅读 <span aria-hidden="true">↗</span>
          </a>
          <a class="wl-btn wl-btn--ghost" href="/about">关于本站</a>
          <a class="wl-btn wl-btn--text" href="https://github.com/wulusai2333" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </header>

      <aside class="wl-hero__stats" aria-label="站点数据">
        <div class="wl-stat">
          <strong>{{ stats.totalDocs }}</strong>
          <span>篇文档</span>
        </div>
        <div class="wl-stat">
          <strong>{{ stats.sections.length }}</strong>
          <span>个分区</span>
        </div>
        <div class="wl-stat">
          <strong>{{ (stats.totalChars / 10000).toFixed(1) }}<span>w</span></strong>
          <span>字笔记</span>
        </div>
      </aside>
    </div>

    <div class="wl-hero__foot">
      <span class="wl-hero__plate">
        <b>{{ String(active + 1).padStart(2, '0') }}</b> / {{ String(heroArt.length).padStart(2, '0') }}
        <em>{{ current.caption }}</em>
      </span>
      <a class="wl-scroll" href="#exhibit">
        <span>向下 · 进入展厅</span>
        <i aria-hidden="true" />
      </a>
      <span class="wl-hero__coord">31°14′N · 121°28′E</span>
    </div>
  </section>
</template>
