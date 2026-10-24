<script setup lang="ts">
/**
 * AI 娘档案（首页节选）
 * ----------------------------------------------------------------------------
 * 素材来自本地开源仓库 图片素材库/ai-girls（ZipZipPipe 等作者的公开作品）。
 * 这些立绘是白底，所以这一节刻意切成「暖纸展柜」：白底用 multiply 融进纸里，
 * 既保留原图，又不会在深色页面上贴一块块白方块。
 *
 * 版权与署名：角色形象版权归原作者，非商用；完整名单与来源见 /AI/ 页面。
 */
import { aiGirlArt } from '../art-meta'

const picks = ['deepseek', 'gpt', 'claude', 'gemini', 'qwen', 'kimi']
  .map((id) => aiGirlArt.find((girl) => girl.id === id))
  .filter(Boolean)
</script>

<template>
  <section class="wl-girls" aria-labelledby="wl-girls-title">
    <div class="wl-girls__paper">
      <div class="wl-girls__inner wl-pad">
        <header class="wl-girls__head">
          <div>
            <p class="wl-eyebrow wl-eyebrow--ink"><span>04 / THE ARCHIVE</span><span class="wl-eyebrow__meta">开源素材 · 非商用</span></p>
            <h2 id="wl-girls-title" class="wl-display">AI 娘档案</h2>
            <p>
              模型拟人化的公开设定集。原作者把「如果大模型是女孩子」画成了 13 位角色，
              这里按图录方式陈列，并保留署名。
            </p>
          </div>
          <span class="wl-girls__stamp">13<br /><i>位</i></span>
        </header>

        <ul class="wl-girls__grid">
          <li v-for="(girl, i) in picks" :key="girl!.id" class="wl-girl-card">
            <span class="wl-girl-card__no">{{ String(i + 1).padStart(2, '0') }}</span>
            <img :src="girl!.src" :alt="girl!.name + ' · ' + girl!.character" :width="girl!.w" :height="girl!.h" loading="lazy" decoding="async" />
            <div class="wl-girl-card__meta">
              <strong>{{ girl!.name }}</strong>
              <span>{{ girl!.character }}</span>
              <em>{{ girl!.credit }}</em>
            </div>
          </li>
        </ul>

        <footer class="wl-girls__foot">
          <p>角色形象：ZipZipPipe / 上善无形；本页为非商业展示，保留署名。若原作者认为不妥，可联系下架。</p>
          <span class="wl-girls__links">
            <a href="/AI/AI娘档案">查看全部 13 位 <span aria-hidden="true">→</span></a>
            <a href="/AI/">AI 分区</a>
          </span>
        </footer>
      </div>
    </div>
  </section>
</template>
