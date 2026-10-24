import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeHero from './components/HomeHero.vue'
import HomePreface from './components/HomePreface.vue'
import GalleryWall from './components/GalleryWall.vue'
import QuoteBand from './components/QuoteBand.vue'
import SectionGrid from './components/SectionGrid.vue'
import AiGirlsStrip from './components/AiGirlsStrip.vue'
import RecentUpdates from './components/RecentUpdates.vue'
import ArticleHead from './components/ArticleHead.vue'
import AiGirlArchive from './components/AiGirlArchive.vue'
import ReadingProgress from './components/ReadingProgress.vue'
import ArticleSummary from './components/ArticleSummary.vue'
import ArticleFooter from './components/ArticleFooter.vue'
import Mermaid from './components/Mermaid.vue'
import { setupEffects } from './effects'
import './custom.css'
import './home.css'
import './article.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      // 顶部阅读进度条（带小鲸鱼）
      'layout-top': () => h(ReadingProgress),
      // 文章头图区：分区封面 + 图录编号 + 标题 / 日期 / 阅读时长
      'doc-top': () => h(ArticleHead),
      // 文章顶部的一句话速览
      'doc-before': () => h(ArticleSummary),
      // 文章底部：复制 Markdown / AI 提问 / 相关文章
      'doc-after': () => h(ArticleFooter)
    })
  },
  enhanceApp({ app }) {
    app.component('HomeHero', HomeHero)
    app.component('HomePreface', HomePreface)
    app.component('GalleryWall', GalleryWall)
    app.component('QuoteBand', QuoteBand)
    app.component('SectionGrid', SectionGrid)
    app.component('AiGirlsStrip', AiGirlsStrip)
    app.component('RecentUpdates', RecentUpdates)
    app.component('AiGirlArchive', AiGirlArchive)
    app.component('Mermaid', Mermaid)
    setupEffects()
  }
} satisfies Theme
