/**
 * 轻量视觉特效：卡片聚光灯 + 滚动进场
 * ----------------------------------------------------------------------------
 * 三个原则：
 * 1. 渐进增强 —— 进场动画的初始态由 <html class="wl-fx"> 开启，
 *    脚本没跑起来时内容照样可见，不会白屏。
 * 2. 尊重 prefers-reduced-motion —— 关掉动画的人只拿到静态页面。
 * 3. 不抢主线程 —— 指针事件用 rAF 节流，DOM 变化用防抖扫描。
 */

/** 滚进视野时需要做入场动画的选择器 */
const REVEAL_SELECTOR = [
  '.wl-card',
  '.VPFeature',
  '.wl-recent__list li',
  '.wl-related__list li',
  '.wl-exhibit__item',
  '.wl-wall__grid li'
].join(',')

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

export function setupEffects() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  // 调试开关：?nofx=1 时完全不启用特效。
  // 用途是判断「某块内容看不见」到底是动画藏住了，还是压根没渲染出来 ——
  // 以前排查这个问题只能靠猜，加个开关省事。
  if (new URLSearchParams(window.location.search).has('nofx')) return

  // 先开保险丝：后面的 CSS 才会把卡片置为「待入场」
  document.documentElement.classList.add('wl-fx')

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ---- 1. 卡片聚光灯：把指针位置写进 CSS 变量 ---- */
  let pointerQueued = false
  let lastEvent: PointerEvent | null = null

  const applyPointer = () => {
    pointerQueued = false
    const event = lastEvent
    if (!event) return
    const target = event.target as HTMLElement | null
    const card = target?.closest?.('.wl-card, .VPFeature') as HTMLElement | null
    if (!card) return
    const rect = card.getBoundingClientRect()
    card.style.setProperty('--wl-mx', `${event.clientX - rect.left}px`)
    card.style.setProperty('--wl-my', `${event.clientY - rect.top}px`)
  }

  window.addEventListener(
    'pointermove',
    (event) => {
      lastEvent = event
      if (pointerQueued) return
      pointerQueued = true
      requestAnimationFrame(applyPointer)
    },
    { passive: true }
  )

  /* ---- 2. 滚动进场 ---- */
  if (reduceMotion || !('IntersectionObserver' in window)) return

  const REVEAL_CLASS = 'wl-reveal'

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-in')
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.05 }
  )

  /**
   * 扫描并登记待进场元素。
   * 隐藏态由这里打上的 .wl-reveal 负责 —— 只有「确定会被观察」的元素才会被隐藏，
   * 所以不存在「加了隐藏类却没人来取消」导致内容凭空消失的可能。
   * （之前把隐藏写在 CSS 里，结果 SSR 水合出来的相关文章列表没有被观察到，
   *   整块内容永久停在 opacity:0，因为截图才发现。）
   */
  const scan = () => {
    document.querySelectorAll(`${REVEAL_SELECTOR}:not(.${REVEAL_CLASS})`).forEach((el) => {
      el.classList.add(REVEAL_CLASS)
      observer.observe(el)
    })
  }

  // 多重保险：挂载后一帧、window load、DOM 变化、滚动都补扫一次。
  // VitePress 是 SPA，切页会整块换 DOM，而 SSR 水合可能一次 childList 都不触发。
  requestAnimationFrame(scan)
  window.addEventListener('load', scan)

  const rescan = debounce(scan, 200)
  const mutation = new MutationObserver(rescan)
  mutation.observe(document.body, { childList: true, subtree: true })

  let scrollTimer: ReturnType<typeof setTimeout> | undefined
  window.addEventListener(
    'scroll',
    () => {
      if (scrollTimer) return
      scrollTimer = setTimeout(() => {
        scrollTimer = undefined
        scan()
      }, 400)
    },
    { passive: true }
  )

  // 最后一道兜底：万一观察器因为浏览器 bug 没回调，也不能让内容一直不可见。
  // 只放行「已经在视口内或视口上方」的元素，视口下方的滚动动画照常保留。
  setTimeout(() => {
    document.querySelectorAll<HTMLElement>(`.${REVEAL_CLASS}:not(.is-in)`).forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in')
    })
  }, 5000)
}
