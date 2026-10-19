import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeCategories from './components/HomeCategories.vue'
import RecentUpdates from './components/RecentUpdates.vue'
import ReadingProgress from './components/ReadingProgress.vue'
import Mermaid from './components/Mermaid.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => h(ReadingProgress)
    })
  },
  enhanceApp({ app }) {
    app.component('HomeCategories', HomeCategories)
    app.component('RecentUpdates', RecentUpdates)
    app.component('Mermaid', Mermaid)
  }
} satisfies Theme
