---
title: '当标题很长、代码也很长时：让内容在窄屏上保持完整，而不是为了整齐牺牲可读性'
description: '专门用于检查长标题、长代码、链接和表格在手机屏幕中的表现。'
slug: 'long-lines'
pubDate: '2026-07-28'
category: 'technology'
tags: ['CSS', '排版']
featured: false
lang: 'zh-CN'
---

这是一篇布局边界示例。长内容应该在自身区域内换行或滚动，而不是把整个页面撑宽。

## 代码可以横向滚动

```ts
const intentionallyLongExample = {
  description:
    'This deliberately long line demonstrates horizontal scrolling inside the code block without expanding the entire document on a narrow mobile viewport.',
  preserveContent: true,
  neverClipText: true,
};
```

## 表格保留完整信息

| 输入条件                 | 期望行为               | 不应该发生的事情     |
| ------------------------ | ---------------------- | -------------------- |
| 非常长的代码行和嵌套对象 | 代码块内部出现横向滚动 | 页面整体出现横向滚动 |
| 连续英文字符             | 标题或段落按需折行     | 文字被裁掉且无法阅读 |
| 复杂的数据表格           | 表格内部可以滚动       | 通过极小字号强行压缩 |

## 一段连续字符串

abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789

读者应该始终可以完整取得内容，即使内容没有遵循我们最喜欢的长度。
