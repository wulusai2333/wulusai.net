<script setup lang="ts">
/**
 * 画墙：14 张横版插画，标签筛选 + 原生 dialog 灯箱。
 * ----------------------------------------------------------------------------
 * v3 起标签改成「角色 / 场景 / 夜 / 晨」：前两个看画面主体，后两个看时段。
 * 版式用 CSS 多栏（column-count）做错落，而不是等宽网格：
 * 同一面墙上如果每张都一样大，会像缩略图列表，不像收藏。
 *
 * 灯箱保留键盘左右切换；打开时锁页面滚动。所有图 lazy，首屏只加载当前视口。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { galleryArt, type Artwork } from '../art-meta'

const TAGS = ['全部', '角色', '场景', '夜', '晨'] as const
type Tag = (typeof TAGS)[number]

const activeTag = ref<Tag>('全部')
const dialog = ref<HTMLDialogElement | null>(null)
const index = ref(-1)

const filtered = computed<Artwork[]>(() =>
  activeTag.value === '全部'
    ? galleryArt
    : galleryArt.filter((art) => art.tags.includes(activeTag.value))
)

const current = computed(() => filtered.value[index.value] ?? null)

const counts = computed(() => {
  const map: Record<string, number> = { 全部: galleryArt.length }
  for (const tag of TAGS.slice(1)) {
    map[tag] = galleryArt.filter((art) => art.tags.includes(tag)).length
  }
  return map
})

function select(tag: Tag) {
  activeTag.value = tag
  index.value = -1
}

function open(i: number) {
  index.value = i
  dialog.value?.showModal()
  document.documentElement.classList.add('wl-lock')
}

function close() {
  dialog.value?.close()
}

function onClose() {
  index.value = -1
  document.documentElement.classList.remove('wl-lock')
}

function step(delta: number) {
  const total = filtered.value.length
  if (!total) return
  index.value = (index.value + delta + total) % total
}

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) close()
}

function onKeydown(event: KeyboardEvent) {
  if (!dialog.value?.open) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    step(1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.documentElement.classList.remove('wl-lock')
  dialog.value?.close()
})
</script>

<template>
  <section id="gallery" class="wl-salon wl-section" aria-labelledby="wl-gallery-title">
    <div class="wl-head">
      <div>
        <p class="wl-eyebrow"><span>02 / THE WALL</span><span class="wl-eyebrow__meta">收藏 · 不按时间</span></p>
        <h2 id="wl-gallery-title" class="wl-display">画墙</h2>
        <p class="wl-head__desc">
          本站的配色、语气和留白，都从这批图里长出来。点开可看大图，左右方向键翻页。
        </p>
      </div>
      <div class="wl-filters" role="group" aria-label="按主题筛选">
        <button
          v-for="tag in TAGS"
          :key="tag"
          type="button"
          class="wl-chip"
          :class="{ 'is-active': activeTag === tag }"
          :aria-pressed="activeTag === tag"
          @click="select(tag)"
        >
          {{ tag }}<sup>{{ counts[tag] }}</sup>
        </button>
      </div>
    </div>

    <ul :key="activeTag" class="wl-salon__grid">
      <li v-for="(art, i) in filtered" :key="art.id" class="wl-salon__item">
        <button type="button" class="wl-tile" @click="open(i)">
          <span class="wl-tile__frame" :style="{ backgroundColor: art.color }">
            <img
              :src="art.src"
              :alt="art.alt"
              :width="art.w"
              :height="art.h"
              loading="lazy"
              decoding="async"
            />
            <span class="wl-tile__more" aria-hidden="true">查看 ↗</span>
          </span>
          <span class="wl-tile__plate">
            <b>{{ String(i + 1).padStart(2, '0') }}</b>
            <span class="wl-tile__name">{{ art.caption }}</span>
            <em>{{ art.tags.join(' / ') }}</em>
          </span>
        </button>
      </li>
    </ul>

    <dialog ref="dialog" class="wl-lightbox" @click="onBackdrop" @close="onClose">
      <div v-if="current" class="wl-lightbox__stage">
        <img :src="current.src" :alt="current.alt" />
        <button class="wl-lightbox__nav is-prev" type="button" aria-label="上一张" @click="step(-1)">←</button>
        <button class="wl-lightbox__nav is-next" type="button" aria-label="下一张" @click="step(1)">→</button>
      </div>
      <div class="wl-lightbox__bar">
        <span class="wl-lightbox__count">{{ String(index + 1).padStart(2, '0') }} / {{ String(filtered.length).padStart(2, '0') }}</span>
        <span class="wl-lightbox__caption">{{ current?.caption }}</span>
        <button class="wl-lightbox__close" type="button" aria-label="关闭" @click="close">关闭 ✕</button>
      </div>
    </dialog>
  </section>
</template>
