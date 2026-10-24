<script setup lang="ts">
/**
 * AI 娘档案 · 展柜
 * ----------------------------------------------------------------------------
 * 素材来自站主的开源素材库 `图片素材库/ai-girls`（作者 ZipZipPipe 等），
 * 这些立绘是白底，所以整段切成「暖纸展柜」：白底用 multiply 融进纸里，
 * 深色页面上不会出现一块块白方块。
 *
 * 署名与许可以 `图片素材库/ai-girls/NOTICE.md` 为准，这里只做展示；
 * 许可见本页下方「素材来源与许可」。
 */
import { aiGirlArt } from '../art-meta'

const girls = aiGirlArt
</script>

<template>
  <section class="wl-archive" aria-label="AI 娘图录">
    <div class="wl-archive__paper">
      <div class="wl-archive__inner">
        <header class="wl-archive__head">
          <p class="wl-archive__eyebrow">
            <span>THE ARCHIVE</span>
            <span class="wl-archive__meta">{{ girls.length }} 位 · 非商业展示</span>
          </p>
          <p class="wl-archive__lede">
            每一个名字都是一个大模型，每一个形象都是社区画的。按收录顺序陈列，不排名次。
          </p>
        </header>

        <ul class="wl-archive__grid">
          <li v-for="(girl, i) in girls" :key="girl.id" class="wl-archive__card">
            <span class="wl-archive__no">{{ String(i + 1).padStart(2, '0') }}</span>
            <figure>
              <img
                :src="girl.src"
                :alt="girl.name + ' · ' + girl.character"
                :width="girl.w"
                :height="girl.h"
                loading="lazy"
                decoding="async"
              />
            </figure>
            <div class="wl-archive__text">
              <strong>{{ girl.name }}</strong>
              <span>{{ girl.character }}</span>
              <em>{{ girl.credit }}</em>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
