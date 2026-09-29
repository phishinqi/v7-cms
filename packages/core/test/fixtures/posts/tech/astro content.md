---
title: '用 Astro 内容集合，整理一个长期生长的博客'
description: '把文章当作有结构的内容：分类、标签、发布时间，以及那些不该被意外发布的草稿。'
slug: 'astro-content'
pubDate: '2026-09-12'
category: 'astro'
tags: ['Astro', 'TypeScript']
featured: true
lang: 'zh-CN'
updatedDate: '2026-09-20'
---

本文是主题的技术写作示例，代码用于说明当前主题的内容约定。

## 内容先于页面

文章的标题、摘要和发布时间不应该只是一段随意的文本。我们为这些信息建立清晰的约定，让构建过程提前发现错误。

```ts
interface Article {
  title: string;
  description: string;
  slug: string;
  pubDate: Date;
  category: 'technology' | 'journal';
  tags: string[];
}
```

把元信息与正文分开之后，同一篇文章可以出现在首页、归档、RSS 和搜索结果里，而不需要维护几份互不一致的数据。

## 公开内容只有一个入口

主题的列表、详情和订阅源都从同一个公开文章函数取得数据。草稿和未来日期内容在这里被排除。

```ts
const visible = posts
  .filter(({ data }) => !data.draft && data.pubDate <= now)
  .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
```

### 保持 URL 稳定

文章标题可能调整，网址不应该随之改变。使用独立的 `slug` 可以让外部链接长期有效。

| 字段       | 用途         | 建议                 |
| ---------- | ------------ | -------------------- |
| `slug`     | 稳定的网址   | 使用小写英文和连字符 |
| `category` | 文章的主分类 | 一篇文章选择一个     |
| `tags`     | 更具体的主题 | 使用少量有意义的标签 |
| `draft`    | 暂不发布     | 完稿前设为 true      |

## 把错误留在构建阶段

重复 slug、无效日期和未声明分类会中断构建。宁愿在本地修正一条数据，也不要等读者点开之后才发现页面不见了。
