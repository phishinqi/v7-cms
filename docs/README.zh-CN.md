# 中文说明

v7-cms 是一个给静态站点用的 Git 型编辑器。你在配置文件里描述内容，编辑器读写那些文件 —— 可以写进
GitHub 仓库，也可以直接写你本机的一个文件夹。

[English](../README.md) · [快速开始](getting-started.md) · [认证与 OAuth](authentication.md) ·
[配置](configuration.md) · [流程与部署](workflow-and-deploying.md)

## 它解决什么问题

Decap CMS 已停止实质维护，而且它的自定义字段**不能复用**自己的 `object`、`list`、`richtext`
类型。Keystatic 和 Sveltia 有同样的限制。这直接排除了相册这类内容 —— 每张照片是一个嵌套对象，里面
还有若干可选子对象。v7-cms 把那类结构当作一等公民。

另一条更重要的规则：**你没编辑的内容不会被碰**。打开一个文件再保存，产出的字节完全一致 ——
引号、flow 风格、键顺序、注释都一样。这条保证是整个设计存在的理由，也是测试最重的一块：它的测试
就是真实站点的真实内容。

## 快速开始

1. 在站点根目录写 `cms.config.json`，描述你的集合和字段。见[配置](configuration.md)。
2. 页面上挂载编辑器。它是一个文件：

```html
<link rel="stylesheet" href="/cms/cms.css" />
<div id="cms-root"></div>
<script type="module">
  import { mount } from '/cms/v7-cms.js';
  const config = await fetch('/cms.config.json').then((r) => r.json());
  mount({ container: '#cms-root', config });
</script>
```

3. 打开页面，选一个仓库。

## 三种后端

| 后端       | 需要什么                   | 哪些浏览器能用                     |
| ---------- | -------------------------- | ---------------------------------- |
| GitHub     | 一个令牌，或走中转的 OAuth | 全部                               |
| 本机文件夹 | 什么都不用                 | Chromium（File System Access API） |
| 本地代理   | 一条命令                   | 全部                               |

**本机文件夹**最省事：不用服务器、不用令牌，编辑器通过浏览器的 File System Access API 直接读写
你选的文件夹。选一次会被记住；每次访问会重新申请权限，这是 API 的要求，也让授权不至于悄无声息地
一直有效。

**本地代理**是为 Firefox 和 Safari 准备的 —— 那两个浏览器没有上面那个 API：

```sh
# 尚未发布到 npm：从本仓库检出后运行。
pnpm install && pnpm --filter @v7-cms/proxy build
node packages/proxy/dist/cli.mjs --root .
```

它会打印一个 URL 和一个令牌，粘进编辑器即可。它零依赖，只监听 loopback，并且**拒绝**绑定其他
地址 —— 一个能写你仓库的进程绝不能被网络访问到。所有路径都会被解析和校验，`../` 或符号链接都逃
不出去，这些都有测试覆盖。

## 正文编辑器：双轨

富文本编辑器会规范化 Markdown —— 重排强调符号、对齐表格、改围栏风格。这对散文没问题，对 MDX 是
灾难：MDX 里有 ES module 的 import 和 JSX，Markdown 编辑器根本不认识。所以每段正文在打开前会先
判定：

| 正文里有                                                | 用什么编辑器 |
| ------------------------------------------------------- | ------------ |
| 散文、标题、列表、链接、图片、普通代码块                | 富文本       |
| MDX 文件、`import`/`export`、JSX、HTML 块               | 源码         |
| 结构化围栏（`mermaid`、`abc` 等）、块级公式、缩进代码块 | 源码         |

偏向很明确：**拿不准就走源码**。判错成源码，你只是少了个好看的编辑器；判错成富文本，文件被悄悄
改坏。想强行用富文本可以，但那是一个明确的、带警告的动作。

## 预览

编辑器把正文显示在表单旁边，两种模式。Markdown 预览始终可用，按站点的方式渲染，包括图表和公式；
配置里给了开发服务器地址的话，还能用 iframe 嵌真实站点。

图表引擎（Mermaid、KaTeX、abcjs）在预览**真的用到**时才从 CDN 拉取。Mermaid 一个就是好几 MB 的
图表代码，打进包里会把 500 kB 的编辑器变成 18 MB、67 个分块。没有图表的文章一个字节都不下载 ——
这条有测试断言。

## 草稿与审核

有两个东西都叫「草稿」，混在一起会造成真实的混乱：

- **frontmatter 里的 `draft`** 是构建期排除标记，你的站点不会发布它，无论编辑器怎么说。这是你自己
  的开关，编辑器不会替你改。
- **流程状态**是审核进度，存在分支或状态文件里，**永远不进 frontmatter**。

在 GitHub 上，草稿是一条 `cms/<路径>` 分支，审核是一个 PR，发布就是合并。本机文件夹没有分支，状态
记在 `.v7-cms/workflow.json`，请把那个路径加进 `.gitignore`。

## 扩展

插件是一个普通对象，启动时注册一次：

```ts
import { registerPlugin } from '@v7-cms/cms';

registerPlugin({
  name: 'my-site',
  fields: [myFieldType],
  renderers: [myPreviewRenderer],
  theme: { accent: '#964630' },
});
```

字段类型只描述怎么读、怎么写、什么算空，**不描述界面** —— 所以同一个类型在浏览器和 Node 脚本里
都能用。设计令牌会写成 CSS 自定义属性，换主题不需要写 CSS，也不需要知道任何类名。

## 体积

构建产物**约 650 kB（gzip）**，单文件，外加约 11 kB 的 CSS。这是同时装两个真编辑器（富文本用
Tiptap/ProseMirror，源码用 CodeMirror）加 React 的诚实代价，和 Sveltia、Decap 一个量级。它只在
编辑器页面加载一次，你发布的页面里一点都没有。

## 边界

- **不编译 MDX**。编辑器把 MDX 当文本处理，预览里 JSX 显示为源码，不执行。
- **不做字段级沙箱**。插件是你自己的可信代码。
- **不在浏览器里加密令牌**。浏览器里没有真秘密，加密是安全剧场。

## 许可

MIT。见 [LICENSE](../LICENSE)。
