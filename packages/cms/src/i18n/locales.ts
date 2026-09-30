/**
 * The dictionaries themselves.
 *
 * `en` is imported from the contract file so the two can never drift: adding a key there is a
 * compile error until every locale below has it.
 */
import { en, type Dictionary, type TranslationKey } from './dictionary.js';

export { en };
export type { Dictionary, TranslationKey };

export const zhCN: Dictionary = {
  'nav.collections': '内容',
  'nav.settings': '设置',
  'common.cancel': '取消',
  'nav.brand': 'V7 CMS',
  'account.signedInAs': '已登录',
  'account.viaOauth': 'GitHub 账号登录',
  'account.viaToken': '访问令牌',
  'account.signOut': '退出登录',
  'account.signOutConfirm': '确定退出编辑器？',
  'account.localFolder': '本地文件夹',
  'account.localFolderHint': '正在编辑此设备上的文件',
  'account.disconnect': '关闭文件夹',

  'config.title': '配置有问题',

  'connect.title': '打开一个仓库',
  'connect.tabFolder': '本地文件夹',
  'connect.tabProxy': '本地代理',
  'connect.tabGithub': '使用 GitHub 登录',
  'connect.tabToken': '访问令牌',
  'connect.folderHint':
    '选择你的仓库文件夹。编辑器直接读写这些文件——不需要服务器，也不需要令牌——在你亲自推送之前不会提交任何内容。',
  'connect.chooseFolder': '选择文件夹',
  'connect.proxyHint': '让编辑器连接一个本地代理，由它读写你的仓库。',
  'connect.githubHint': '用 GitHub 登录，通过它的 API 读写仓库。每次保存都会成为一次提交。',
  'connect.tokenHint': '粘贴一个有仓库写权限的个人访问令牌。它只保存在当前浏览器里。',
  'connect.folderDenied': '没有获得该文件夹的访问权限，请重新选择。',
  'connect.connect': '连接',
  'connect.connecting': '正在连接…',
  'connect.signIn': '使用 GitHub 登录',
  'connect.waiting': '正在等待 GitHub…',
  'connect.checking': '正在检查…',
  'connect.remember': '在此设备上记住',
  'connect.howTo': '如何连接',
  'connect.openRepo': '打开 {repo}',
  'connect.openLocal': '打开一个仓库',
  'connect.noFileSystem':
    '这个浏览器无法打开本地文件夹。请改用本地代理，它在所有浏览器里都能工作。',
  'connect.reopenFolder': '重新打开上次的文件夹',
  'connect.forgetFolder': '清除记录',
  'connect.proxyCommand':
    '从 v7-cms 检出后运行：node packages/proxy/dist/cli.mjs --root . 它会打印一个地址和一个令牌，填到这里。它只监听你自己的机器。',
  'connect.proxyUrl': '代理地址',
  'connect.serving': '正在提供 “{repo}”。',
  'connect.proxyToken': '令牌',
  'connect.patLabel': '个人访问令牌',
  'connect.patHint':
    '需要仓库内容的读写权限。在 GitHub → Settings → Developer settings → Personal access tokens 创建。',
  'connect.githubNotice':
    '使用 GitHub 登录。编辑器会获得你账户的令牌，只能访问你本来就有写权限的仓库。',

  'action.save': '保存',
  'action.saving': '正在保存…',
  'action.saved': '已保存。',
  'action.delete': '删除',
  'action.new': '新建',
  'action.add': '添加',
  'action.upload': '上传',
  'action.working': '处理中…',
  'action.moveUp': '上移',
  'action.moveDown': '下移',
  'action.editRich': '仍用富文本编辑',

  'list.empty': '这里还没有内容。',
  'list.selectEntry': '选择一条内容，或新建一条。',
  'list.unknownCollection': '未知的集合',
  'list.addItem': '添加',

  'field.optional': '（可选）',
  'field.reading': '正在读取',
  'field.body': '正文',

  'notice.fieldsNeedAttention': '个字段需要处理。',
  'notice.fieldsNeedAttentionPlural': '个字段需要处理。',
  'notice.conflict': '这个文件在别处被改动了。保存前请重新打开它。',
  'notice.unchanged': '没有需要保存的改动。',
  'notice.nothingEditable': '这个文件里没有可编辑的内容。',

  'body.sourceOnly': '正以源码模式编辑。',
  'body.richWarning': '富文本会重新排版这个文件。',
  'body.reason.mdx': '这是 MDX 文件，包含 import 和组件。',
  'body.reason.imports': '正文里包含 import 或 export。',
  'body.reason.jsx': '正文里包含组件。',
  'body.reason.html': '正文里包含 HTML。',
  'body.reason.structuredFence': '正文里包含图表或其他结构化代码块。',
  'body.reason.math': '正文里包含块级公式。',
  'body.reason.indentedCode': '正文里包含缩进式代码块。',
  'body.reason.configured': '这个字段被配置为只能用源码编辑。',

  'image.compressing': '正在压缩并移除元数据…',
  'image.noOutput': '图片没有产生输出。',

  'preview.title': '预览',
  'preview.rendered': 'Markdown',
  'preview.site': '站点',
  'preview.siteHint':
    '来自配置中预览地址的真实站点。它显示的是已发布的内容，不是你尚未保存的改动。',
  'preview.markdownHint': 'Markdown 预览。发布后的页面排版可能不同。',
  'preview.inContextHint': '点击页面上的文字，直接编辑产生它的字段。',
  'preview.inContextNeedsPath':
    '内联编辑需要配置 pathTemplate，编辑器才知道这个条目在开发服务器上的地址。',
  'preview.open': '在新标签页打开',
};

/** Every locale the editor ships. Add one here and in `Locale` to offer it. */
export const locales = {
  en,
  'zh-CN': zhCN,
} as const;
