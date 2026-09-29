/**
 * Mounts the editor with the blog's album config and a seeded memory backend, so the browser
 * tests and screenshots exercise the real thing rather than a mock. Also exposes the backend on
 * `window` so a test can assert what was written.
 */
import { mount } from '@v7-cms/cms';
import { MemoryAdapter } from '@v7-cms/adapters/memory';
import config from '../../../examples/v7-blog/cms.config.json';
import { richRoundTrip } from '@v7-cms/cms';

const files: Record<string, string> = {
  'content/albums/paper.md': `---
title: 纸面练习
slug: paper
date: '2026-09-01'
draft: false
tags: [paper, sketch]
cover: terracotta-pattern
images:
  - src: /images/paper-study.svg
    id: paper-study
    kind: artwork
    alt: 米白纸面上的线条与陶土色圆形
    width: 1200
    height: 720
    title: 纸面习作
    caption: 主题自带的抽象示意图。
    date: '2026-08-02'
    tags: [paper]
    artwork: { device: 示例平板, software: 示例绘图软件, medium: 数字 }
  - src: /images/albums/paper/terracotta-pattern.jpg
    kind: artwork
    alt: 一排排半圆拱形组成的陶土色纹样
    width: 1200
    height: 1200
    title: 陶土纹样
    date: '2026-08-10'
    tags: [pattern]
    license: cc-by-nc-4.0
    artwork: { device: 示例平板, software: 示例绘图软件, medium: 数字 }
---

一个“创作”类型的相册示例。
`,
  'content/albums/city-corners.md': `---
title: 城市边角
slug: city-corners
date: '2026-09-12'
draft: false
description: 窗格、台阶与路灯。
tags: [street, architecture]
images:
  - src: /images/albums/city-corners/window-grid.jpg
    alt: 米色楼面上整齐排列的深色窗格
    width: 1200
    height: 1600
    title: 亮着的一扇窗
    location: 示例城市 · 河畔街
    tags: [architecture, night]
    photo:
      camera: Demo Camera X1
      lens: Demo 35mm F1.8
      iso: 800
---

一个“摄影”类型的相册示例。
`,
  'content/posts/small-components.mdx': `---
title: '小组件，大边界'
description: 'MDX 示例。'
slug: 'small-components'
pubDate: '2026-09-03'
category: 'technology'
tags: ['MDX']
lang: 'zh-CN'
---

import Note from '@components/Note.astro';

这是一篇 MDX 示例。

<Note title="先写正文，再考虑组件">
  组件之外的文字照常书写。
</Note>
`,
  'content/posts/math-and-diagrams.md': `---
title: '让公式与流程图，成为解释的一部分'
description: '含图表与公式。'
slug: 'math-and-diagrams'
pubDate: '2026-09-21'
category: 'technology'
tags: ['数学']
lang: 'zh-CN'
---

正文一段。

\`\`\`mermaid
flowchart LR
  A[写作] --> B[校验]
\`\`\`
`,
  'content/posts/a-smaller-web.md': `---
title: 'A smaller web, with room to read'
description: 'An English sample.'
slug: 'a-smaller-web'
pubDate: '2026-08-20'
category: 'technology'
tags: ['设计', 'Web']
featured: false
lang: 'en'
---

Body text.
`,
};

const storage = new MemoryAdapter(files);
declare global {
  interface Window {
    __cms: { storage: MemoryAdapter; richRoundTrip(markdown: string): string };
  }
}
// Exposed so the browser tests can measure what the rich editor does to Markdown.
window.__cms = { storage, richRoundTrip };

// The example config targets GitHub. The harness runs against memory instead, which is what makes
// the editor drivable without a token — the backend block is the only thing that changes.
mount({
  container: '#cms',
  config: { ...(config as object), backend: { name: 'local', local: { kind: 'memory' } } },
  storage,
});
