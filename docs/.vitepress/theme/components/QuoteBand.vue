<script setup lang="ts">
import { bandArt } from '../art-meta'
import ThemeImage from './ThemeImage.vue'

// v3 图像带按 id 取，取不到退回首张；整组还没出图时整段不渲染
const art = bandArt.find((item) => item.id === 'white-veil') ?? bandArt[0]
</script>

<template>
  <section v-if="art" class="wl-band" aria-label="站点素材观">
    <ThemeImage :art="art" img-class="wl-band__img" />
    <span class="wl-band__veil" aria-hidden="true" />
    <div class="wl-band__inner wl-pad">
      <p class="wl-eyebrow wl-eyebrow--light"><span>INTERLUDE</span><span class="wl-eyebrow__meta">关于素材</span></p>
      <blockquote>
        收藏不是背景，<br />
        是正文的一部分<span>。</span>
      </blockquote>
      <cite>—— 本站的素材观 · {{ art.caption }}</cite>
    </div>
  </section>
</template>
