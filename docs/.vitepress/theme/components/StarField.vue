<script setup lang="ts">
/**
 * 深海浮游粒子
 * ----------------------------------------------------------------------------
 * 铺在首页 Hero 的实景底图之上、内容之下。粒子缓慢上浮 + 呼吸闪烁，
 * 营造「深海里的浮游生物 / 星尘」的感觉。
 *
 * 性能约束（首页首屏很关键）：
 * - 只画小圆点，不用 shadowBlur（那是最贵的 canvas 操作）
 * - 粒子数按画布面积算，硬上限 120
 * - 限制 DPR 到 2，4K 屏上不做过量的像素填充
 * - 标签页不可见 / 组件卸载时停掉 rAF
 * - prefers-reduced-motion 时只画一帧静态星野
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'

interface Particle {
  x: number
  y: number
  r: number
  a: number
  vx: number
  vy: number
  phase: number
}

const canvas = ref<HTMLCanvasElement | null>(null)
const { isDark } = useData()

let raf = 0
let teardown: (() => void) | null = null

onMounted(() => {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let width = 1
  let height = 1
  let particles: Particle[] = []
  let running = true

  const build = () => {
    const rect = el.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.round(width * dpr)
    el.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const count = Math.min(120, Math.round((width * height) / 15000))
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.5 + 0.4,
      a: Math.random() * 0.45 + 0.2,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -(Math.random() * 0.16 + 0.03),
      phase: Math.random() * Math.PI * 2
    }))
  }

  const paint = (time: number) => {
    ctx.clearRect(0, 0, width, height)
    // 浅色模式下粒子要转成深蓝，否则白底上看不见
    const rgb = isDark.value ? '190, 226, 255' : '86, 104, 196'
    for (const p of particles) {
      const twinkle = 0.6 + 0.4 * Math.sin(time / 1500 + p.phase)
      ctx.beginPath()
      ctx.fillStyle = `rgba(${rgb}, ${p.a * twinkle})`
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const step = (time: number) => {
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      if (p.y < -8) {
        p.y = height + 8
        p.x = Math.random() * width
      } else if (p.y > height + 8) {
        p.y = -8
      }
      if (p.x < -8) p.x = width + 8
      else if (p.x > width + 8) p.x = -8
    }
    paint(time)
    if (running && !reduceMotion) raf = requestAnimationFrame(step)
  }

  const start = () => {
    cancelAnimationFrame(raf)
    if (!reduceMotion) raf = requestAnimationFrame(step)
  }

  const onResize = () => {
    build()
    if (reduceMotion) paint(0)
  }

  const onVisibility = () => {
    if (reduceMotion || !running) return
    if (document.hidden) cancelAnimationFrame(raf)
    else start()
  }

  build()
  if (reduceMotion) paint(0)
  else start()

  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)

  teardown = () => {
    running = false
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVisibility)
  }
})

onUnmounted(() => {
  teardown?.()
  teardown = null
})
</script>

<template>
  <canvas ref="canvas" class="wl-starfield" aria-hidden="true" />
</template>
