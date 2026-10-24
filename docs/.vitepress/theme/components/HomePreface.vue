<script setup lang="ts">
import stats from '../recent.json'

const words = (stats.totalChars / 10000).toFixed(1)
const updated = stats.generatedAt.slice(0, 10)
</script>

<template>
  <section class="wl-preface wl-section" aria-labelledby="wl-preface-title">
    <p class="wl-eyebrow"><span>00 / PREFACE</span><span class="wl-eyebrow__meta">关于这座阅览室</span></p>

    <div class="wl-preface__grid">
      <h2 id="wl-preface-title" class="wl-display">
        一本不追热点的<br />
        <em>工程手册。</em>
      </h2>

      <div class="wl-preface__body">
        <p>
          这里不是博客，更像一本随身的工程手册。把踩过的坑、查过的文档、试出来的方案，
          按主题收在一起 —— 不按知识体系排，按「下次遇到问题时能不能最快找到」排。
        </p>
        <p>
          写的时候假设读者是一个月后的自己：命令标版本，结论给边界，
          没在本机验证过的会直接写「未验证」。写错了就改，改完留下日期。
        </p>
      </div>
    </div>

    <div class="wl-preface__foot">
      <div class="wl-preface__metric">
        <strong>{{ stats.totalDocs }}</strong>
        <span>篇文档</span>
      </div>
      <div class="wl-preface__metric">
        <strong>{{ words }}<i>w</i></strong>
        <span>字笔记</span>
      </div>
      <div class="wl-preface__metric">
        <strong>{{ stats.sections.length }}</strong>
        <span>个分区</span>
      </div>
      <ul class="wl-preface__rules">
        <li>能独立复现</li>
        <li>说清为什么</li>
        <li>标版本、给边界</li>
        <li class="is-muted">最近整理 {{ updated }}</li>
      </ul>
    </div>
  </section>
</template>
