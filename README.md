# 呜路塞的知识库

个人知识库站点，基于 [VitePress](https://vitepress.dev/) 构建，发布在 **<https://wulusai.net>**。

内容偏工程笔记：AI 与大模型、Java、Go、Rust、Linux、Git、数据库、安全，以及 NovelAI / 本地扩散模型这类实践记录。
前身是用 docsify 搭的 [read](https://github.com/wulusai2333/read) 仓库，内容已全部迁移过来。

## 本地开发

```bash
pnpm install     # 安装依赖
pnpm dev         # 本地预览 → http://localhost:5173
pnpm build       # 构建到 docs/.vitepress/dist
pnpm preview     # 预览构建结果
```

`dev` / `build` 之前会自动跑 `scripts/` 里的两个脚本，生成首页统计、「最近更新」、文章摘要与相关推荐（数据读自 Git 提交时间）。

## 站点结构

```
docs/
├── .vitepress/      # 站点配置、侧栏生成、主题与视觉组件
├── public/          # 静态资源：图标、字体、页面配图（art/）
├── index.md         # 首页
├── about.md         # 关于本站
└── <分类>/           # AI、Java、Git、Linux … 每个目录是一组笔记
```

分类的顺序、图标、说明集中在 `docs/.vitepress/sections.json`，它同时驱动侧栏和首页的分类卡片。

## 写一篇新笔记

1. 在对应分类目录里新建 `.md`，正文从 `##` 开始；
2. 提交推送，GitHub Actions 会自动构建上线。

侧栏**不需要手工维护**：新文件自动归入所属分类；想调顺序或标题，改 `sections.json` 的 `order` / `titles`。

动笔之前先读 [AGENTS.md](./AGENTS.md) —— 脱敏要求、质量底线、格式约定都在那里。

## 部署

推送到 `master` 后，[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 自动构建并发布到 GitHub Pages；
自定义域名由 `docs/public/CNAME` 指定。仓库 Pages 需设为 **Source: GitHub Actions**。

## License

笔记内容版权归作者所有，转载请注明出处并保留原文链接。
