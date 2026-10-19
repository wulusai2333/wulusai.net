---
title: 关于本站
---

# 关于本站

这里是我的私人知识库：把平时踩过的坑、查过的文档、试出来的方案记下来，方便日后自己翻，也顺便分享给遇到同样问题的人。

## 站点是怎么搭的

| 项目 | 说明 |
| --- | --- |
| 框架 | [VitePress](https://vitepress.dev/) `1.6.4` —— Vue 官方出品的静态站点生成器 |
| 内容 | 纯 Markdown，不锁定任何编辑器 |
| 部署 | GitHub Actions 自动构建，发布到 GitHub Pages（自定义域名 `wulusai.net`） |
| 搜索 | VitePress 内置本地搜索，构建期生成索引 |
| 历史 | 前身是用 docsify 搭的 `read` 仓库，2026 年迁到本站 |

和旧站相比，主要解决了三件事：

1. **加载更快、能被搜索引擎收录** —— 旧站是客户端渲染，爬虫看到的几乎是空页面；
2. **目录不用手工维护** —— 新文章放进对应分类文件夹就会自动出现在侧边栏，分类顺序和标题只在 `.vitepress/sections.json` 一个文件里配置；
3. **更清爽的阅读体验** —— 移除了全站复制的弹窗提醒、一堆 CDN 插件脚本和 jQuery。

## 怎么加一篇新笔记

1. 在 `docs/` 下对应的分类目录里新建一个 `.md` 文件，用 Markdown 写就行；
2. 想让它出现在侧边栏靠前的位置，就在 `.vitepress/sections.json` 的对应分类 `order` 里补一行路径；不补也行，会自动排在后面；
3. 想指定标题，在 `titles` 里加一行；不指定就自动读取文章里的一级标题；
4. 提交推送，GitHub Actions 会自动构建上线。

本地预览：

```bash
pnpm install
pnpm dev        # 打开 http://localhost:5173
pnpm build      # 构建到 docs/.vitepress/dist
```

## 转载与引用

站内内容都是个人学习笔记，水平有限，难免有错漏，欢迎指正。

**转载请注明出处并保留原文链接**（页面底部和每篇的「在 GitHub 上编辑此页」都能找到源头）。商业用途请先联系我。

> [!TIP]
> 需要整篇复制粘贴也没关系，只要保留来源链接就行 —— 之前那个每次复制都弹窗的提醒已经去掉了，好好写字比弹窗有用。

## 联系

- GitHub：[@wulusai2333](https://github.com/wulusai2333)
- 站点仓库：[wulusai2333/wulusai.net](https://github.com/wulusai2333/wulusai.net)

发现错别字、过期的命令或者链接失效，直接在 GitHub 上提 Issue 或者改一版 PR 都可以，非常欢迎。
