<script setup lang="ts">
/**
 * 精选陈列：一条可以横向拖动的图录。
 *
 * ⚠️ 2026-10-21 起**没有挂在首页**（站主认为这一栏与 AI 娘主题不协调）。
 * 组件与 home.css 的 `.wl-rail*` 样式保留着，方便以后换成 AI 娘精选时复用；
 * 重新启用需要在 theme/index.ts 注册并在 docs/index.md 里放 <ExhibitRail />。
 * 滚动吸附 + 两侧淡出遮罩，桌面用箭头翻页，触屏直接拖。
 */
import { ref } from 'vue'
import { exhibitArt } from '../art-meta'

const track = ref<HTMLElement | null>(null)

function page(direction: number) {
  const el = track.value
  if (!el) return
  const step = Math.min(el.clientWidth * 0.82, 760)
  el.scrollBy({ left: direction * step, behavior: 'smooth' })
}
</script>

<template>
  <section id="exhibit" class="wl-rail" aria-labelledby="wl-exhibit-title">
    <div class="wl-rail__head wl-pad">
      <div class="wl-head wl-head--flush">
        <div>
          <p class="wl-eyebrow"><span>01 / COLLECTION</span><span class="wl-eyebrow__meta">站立翻阅</span></p>
          <h2 id="wl-exhibit-title" class="wl-display">精选陈列</h2>
          <p class="wl-head__desc">从收藏里挑出的十幅插画，同一套竖裁与调色。拖动，或按箭头翻页。</p>
        </div>
        <div class="wl-rail__controls">
          <button type="button" aria-label="向左翻页" @click="page(-1)">←</button>
          <button type="button" aria-label="向右翻页" @click="page(1)">→</button>
        </div>
      </div>
    </div>

    <div ref="track" class="wl-rail__viewport" tabindex="0" aria-label="精选陈列横向图录">
      <ol class="wl-rail__track">
        <li v-for="(art, i) in exhibitArt" :key="art.id" class="wl-rail__item">
          <figure>
            <div class="wl-rail__frame">
              <img
                :src="art.src"
                :alt="art.alt"
                :width="art.w"
                :height="art.h"
                loading="lazy"
                decoding="async"
              />
              <span class="wl-rail__no">No. {{ String(i + 1).padStart(2, '0') }}</span>
            </div>
            <figcaption>
              <span class="wl-rail__cap">{{ art.caption }}</span>
              <span class="wl-rail__tags">{{ art.tags.join(' · ') }}</span>
            </figcaption>
          </figure>
        </li>
      </ol>
    </div>
  </section>
</template>
