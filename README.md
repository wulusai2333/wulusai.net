# 呜路塞的知识库

个人知识库站点，基于 [VitePress](https://vitepress.dev/) 构建，发布在 **<https://wulusai.net>**。

前身是用 docsify 搭的 [read](https://github.com/wulusai2333/read) 仓库，内容已全部迁移过来。

## 本地开发

```bash
pnpm install     # 安装依赖
pnpm dev         # 本地预览 → http://localhost:5173
pnpm build       # 构建到 docs/.vitepress/dist
pnpm preview     # 预览构建结果
```

> `pnpm dev` / `pnpm build` 会先跑一次 `scripts/gen-recent.mjs`，
> 生成首页的分类统计和「最近更新」数据（读取 Git 提交时间）。

## 目录结构

```
docs/
├── .vitepress/
│   ├── config.mts          # 站点配置：导航、搜索、i18n、Markdown 选项
│   ├── sections.json       # ★ 分类顺序、图标、标题覆盖（唯一的目录配置）
│   ├── sidebar.mts         # 侧边栏自动生成器
│   └── theme/
│       ├── index.ts        # 主题入口（继承默认主题 + 注册组件）
│       ├── custom.css      # 全部视觉定制都在这
│       ├── recent.json     # 构建时自动生成，不用手改
│       └── components/     # 首页分类卡片 / 最近更新 / 阅读进度条
├── public/                 # 静态资源：logo、favicon、头像、CNAME、robots.txt
├── index.md                # 中文首页
├── about.md                # 关于本站
├── en/                     # 英文分区
└── Java/ Linux/ DataBase/ … # 各分类的笔记
```

## 写一篇新笔记

1. 在对应分类目录里新建 `.md`，正常写 Markdown；
2. 提交推送，GitHub Actions 会自动构建上线。

侧边栏**不需要手工维护**：

- 新文件会自动出现在所属分类下（顺序默认按文件名，中文按拼音）；
- 想排在前面，就在 `docs/.vitepress/sections.json` 对应分类的 `order` 数组里补一行路径；
- 想指定标题，在 `titles` 里加 `"路径": "标题"`；不加则自动读取文章的一级标题；
- 新加一个分类目录，也会自动变成一个侧边栏分组（想自定义图标和说明，同样写进 `sections.json`）。

`sections.json` 同时驱动首页的分类卡片，改一处两边都会更新。

## 部署

推送到 `master` 分支后，[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 会自动：

1. 安装依赖并构建；
2. 把 `docs/.vitepress/dist` 发布到 GitHub Pages；
3. 自定义域名 `wulusai.net` 由 `docs/public/CNAME` 指定。

> 仓库的 Pages 设置需为 **Source: GitHub Actions**。
> 构建时保留了完整 Git 历史（`fetch-depth: 0`），用于显示每篇的「最后更新于」。

## 写作与内容规范

**动笔之前先读 [AGENTS.md](./AGENTS.md)** —— 内容和格式的规矩都写在那里，不在这里重复：

- **脱敏要求**：什么必须换成占位符、什么整段不能留（唯一例外是 `wulusai2333` 这个署名）
- **质量底线**：一篇合格笔记要同时满足的六条 + 格式约定
- **本地没经验的主题**：怎么主动调研、按 P0→P3 排序
- **从本机项目整理内容**：四步流程

简言之：**可公开、能复现、说清为什么。**

## License

笔记内容版权归作者所有，转载请注明出处并保留原文链接。
