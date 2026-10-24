import { defineConfig } from 'vitepress'
import { generateSidebar, generateSidebarEn } from './sidebar.mts'
// 构建期由 scripts/gen-ai-meta.mjs 生成：每篇文章的一句话摘要
import summaries from './theme/summaries.json'

const summaryMap = summaries as Record<string, { text: string; by: string } | undefined>

const SITE_NAME = '呜路塞的知识库'
const SITE_DESC = '把踩过的坑、读过的书、写过的代码，都收在这里。'
const HOSTNAME = 'https://wulusai.net'
const REPO = 'https://github.com/wulusai2333/wulusai.net'

/**
 * 中文分词器。
 * MiniSearch 自带的分词只按空格/标点切分，中文整句会被当成一个词，
 * 导致「设计模式」这类查询搜不到。这里按「单字 + 相邻二字组」切分，
 * 兼顾召回率与准确度，且不引入任何额外依赖。
 */
function cjkTokenize(text: string): string[] {
  const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
  const chunks =
    text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+|[A-Za-z0-9_]+/g) ?? []
  const tokens: string[] = []

  for (const chunk of chunks) {
    if (CJK.test(chunk)) {
      const chars = Array.from(chunk)
      for (let i = 0; i < chars.length; i++) {
        tokens.push(chars[i])
        if (i + 1 < chars.length) tokens.push(chars[i] + chars[i + 1])
      }
    } else {
      tokens.push(chunk.toLowerCase())
    }
  }

  return tokens
}

const zhSearchTranslations = {
  button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
  modal: {
    displayDetails: '显示详细列表',
    resetButtonTitle: '重置搜索',
    backButtonTitle: '关闭搜索',
    noResultsText: '没有找到结果',
    footer: {
      selectText: '选择',
      selectKeyAriaLabel: '输入',
      navigateText: '切换',
      navigateUpKeyAriaLabel: '上箭头',
      navigateDownKeyAriaLabel: '下箭头',
      closeText: '关闭',
      closeKeyAriaLabel: 'esc'
    }
  }
}

const enSearchTranslations = {
  button: { buttonText: 'Search', buttonAriaLabel: 'Search' },
  modal: {
    displayDetails: 'Display detailed list',
    resetButtonTitle: 'Reset search',
    backButtonTitle: 'Close search',
    noResultsText: 'No results found',
    footer: {
      selectText: 'to select',
      selectKeyAriaLabel: 'Enter',
      navigateText: 'to navigate',
      navigateUpKeyAriaLabel: 'up arrow',
      navigateDownKeyAriaLabel: 'down arrow',
      closeText: 'to close',
      closeKeyAriaLabel: 'esc'
    }
  }
}

const localSearch = {
  provider: 'local' as const,
  options: {
    // 多语言站点：搜索 UI 文案按 locale 区分，配置本身放在顶层 themeConfig
    locales: {
      root: { translations: zhSearchTranslations },
      en: { translations: enSearchTranslations }
    },
    miniSearch: {
      options: { tokenize: cjkTokenize },
      searchOptions: {
        fuzzy: 0.2,
        prefix: true,
        boost: { title: 4, text: 2, titles: 1 }
      }
    }
  }
}

const zhTheme = {
  siteTitle: SITE_NAME,
  logo: '/favicon.svg',
  nav: [
    { text: '首页', link: '/' },
    {
      text: '知识库',
      link: '/Java/设计模式',
      activeMatch:
        '^/(AI|Java|Golang|Rust|Python|C|DataBase|Linux|Git|Fabric|NovelAIDiffusion|Security|Others)/'
    },
    { text: '关于', link: '/about' }
  ],
  sidebar: generateSidebar(),
  outline: { level: [2, 3] as [number, number], label: '本页目录' },
  docFooter: { prev: '上一篇', next: '下一篇' },
  lastUpdated: {
    text: '最后更新于',
    formatOptions: { dateStyle: 'short' as const, timeStyle: 'short' as const }
  },
  darkModeSwitchLabel: '外观',
  lightModeSwitchTitle: '切换到浅色模式',
  darkModeSwitchTitle: '切换到深色模式',
  sidebarMenuLabel: '目录',
  returnToTopLabel: '回到顶部',
  langMenuLabel: '切换语言',
  externalLinkIcon: true,
  editLink: {
    pattern: `${REPO}/edit/master/docs/:path`,
    text: '在 GitHub 上编辑此页'
  },
  footer: {
    message: '内容为个人学习笔记，转载请注明出处并保留原文链接。',
    copyright: 'Copyright © 2020-present 呜路塞'
  }
}

const enTheme = {
  siteTitle: `${SITE_NAME} · English`,
  logo: '/favicon.svg',
  nav: [
    { text: 'Home', link: '/en/' },
    { text: '中文', link: '/' }
  ],
  sidebar: generateSidebarEn(),
  outline: { level: [2, 3] as [number, number], label: 'On this page' },
  docFooter: { prev: 'Previous', next: 'Next' },
  lastUpdated: {
    text: 'Last updated',
    formatOptions: { dateStyle: 'short' as const, timeStyle: 'short' as const }
  },
  darkModeSwitchLabel: 'Appearance',
  sidebarMenuLabel: 'Menu',
  returnToTopLabel: 'Return to top',
  langMenuLabel: 'Change language',
  externalLinkIcon: true,
  editLink: {
    pattern: `${REPO}/edit/master/docs/:path`,
    text: 'Edit this page on GitHub'
  },
  footer: {
    message: 'Personal study notes. Please credit the source when reposting.',
    copyright: 'Copyright © 2020-present wulusai'
  }
}

export default defineConfig({
  lang: 'zh-CN',
  title: SITE_NAME,
  description: SITE_DESC,

  head: [
    // 矢量图标优先：现代浏览器拿到的是任意分辨率都清晰的 SVG
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icon-192.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],
    ['meta', { name: 'theme-color', content: '#0b1230', media: '(prefers-color-scheme: dark)' }],
    ['meta', { name: 'theme-color', content: '#f6f8fe', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'author', content: '呜路塞' }],
    ['meta', { name: 'keywords', content: '呜路塞,知识库,Java,Linux,运维,数据库,AI绘画,大模型,笔记' }],
    ['meta', { name: 'format-detection', content: 'telephone=no' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: SITE_NAME }],
    ['meta', { property: 'og:title', content: SITE_NAME }],
    ['meta', { property: 'og:description', content: SITE_DESC }],
    ['meta', { property: 'og:image', content: `${HOSTNAME}/og-image.jpg` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:locale', content: 'zh_CN' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: `${HOSTNAME}/og-image.jpg` }],
    // 给 AI 爬虫指路：哪份文件是拿来读的
    ['link', { rel: 'alternate', type: 'text/plain', href: '/llms.txt', title: 'llms.txt' }]
  ],

  sitemap: { hostname: HOSTNAME },

  /**
   * public/ 是静态资源目录，里面的 .md（我们生成的 Markdown 镜像）
   * 必须原样拷进 dist，而不是被当成页面去编译 —— 否则正文里的相对图片路径
   * 会让 Rollup 去解析一个根本不存在的模块，直接构建失败。
   */
  srcExclude: ['**/README.md', '**/public/**'],

  /**
   * 逐页补充 head：让每篇文章都有独立的 og 信息和结构化数据。
   * 这一步是「让 AI 搜索更愿意收录」的关键 —— 爬虫拿到 JSON-LD 才知道
   * 这是一篇技术文章、作者是谁、什么时候更新的，而不是一堆散装 HTML。
   */
  transformHead({ pageData }) {
    const head: [string, Record<string, string>, string?][] = []
    const isDoc = pageData.relativePath.includes('/')
    const pageUrl = `${HOSTNAME}/${pageData.relativePath.replace(/\.md$/, '')}`
    const pageTitle = pageData.frontmatter.title || pageData.title

    head.push(['meta', { property: 'og:url', content: pageUrl }])

    if (isDoc && pageTitle) {
      // 优先用构建期生成的摘要当页面描述：
      // 它比「把踩过的坑…」这句站点口号具体得多，og 卡片和 AI 检索都用得上
      const description = summaryMap[pageData.relativePath]?.text || pageData.description || SITE_DESC

      head.push(['meta', { property: 'og:type', content: 'article' }])
      head.push(['meta', { property: 'og:title', content: `${pageTitle} | ${SITE_NAME}` }])
      head.push(['meta', { property: 'og:description', content: description }])

      const schema = {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: pageTitle,
        description,
        inLanguage: 'zh-CN',
        url: pageUrl,
        mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
        author: { '@type': 'Person', name: '呜路塞', url: 'https://github.com/wulusai2333' },
        publisher: { '@type': 'Person', name: '呜路塞' },
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: HOSTNAME }
      }
      head.push(['script', { type: 'application/ld+json' }, JSON.stringify(schema)])
    }

    // 首页预加载 Hero 底图，减少 LCP 等待（两张加起来才 32KB）
    if (pageData.relativePath === 'index.md') {
      head.push([
        'link',
        {
          rel: 'preload',
          as: 'image',
          href: '/bg/hero-dark.webp',
          type: 'image/webp',
          media: '(prefers-color-scheme: dark)'
        }
      ])
      head.push([
        'link',
        {
          rel: 'preload',
          as: 'image',
          href: '/bg/hero-light.webp',
          type: 'image/webp',
          media: '(prefers-color-scheme: light)'
        }
      ])
    }

    return head
  },

  // 笔记里有意指向本机服务的链接（如本地启动的 SD WebUI）不算死链；
  // 其余站内链接写错会直接构建失败，避免上线后才发现。
  ignoreDeadLinks: [/^https?:\/\/localhost(:\d+)?/],

  lastUpdated: true,
  cleanUrls: false,
  metaChunk: true,

  markdown: {
    lineNumbers: false,
    image: { lazyLoad: true },
    // 老笔记里把 Windows 批处理写成了 ```basic
    languageAlias: { basic: 'bat' },
    /**
     * 把 ```mermaid 代码块换成 <Mermaid> 组件。
     * 图表内容 URI 编码后作为普通属性传递，避免引号转义问题；
     * 组件内部解码并「动态」引入 mermaid，只有真的出现图表的页面才会加载它，
     * 不会把几百 KB 的图表依赖塞进每个页面的首屏预加载列表。
     */
    config(md) {
      const fence = md.renderer.rules.fence!.bind(md.renderer.rules)
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        if (token.info.trim().toLowerCase() === 'mermaid') {
          return `<Mermaid code="${encodeURIComponent(token.content)}" />\n`
        }
        return fence(tokens, idx, options, env, self)
      }
    },
    container: {
      tipLabel: '提示',
      warningLabel: '警告',
      dangerLabel: '危险',
      infoLabel: '信息',
      detailsLabel: '详细信息'
    }
  },

  locales: {
    root: { label: '简体中文', lang: 'zh-CN', themeConfig: zhTheme },
    en: { label: 'English', lang: 'en-US', link: '/en/', themeConfig: enTheme }
  },

  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/wulusai2333' }],
    search: localSearch
  }
})
