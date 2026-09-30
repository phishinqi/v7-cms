/**
 * The editor's own interface strings.
 *
 * These are separate from the content the editor edits: a site's `locale` decides what language
 * the *editor chrome* speaks, while `i18n-string` fields decide which languages the *content*
 * carries. The two are independent on purpose — an English site can still be written from a
 * Chinese editor.
 *
 * Keys are flat and dotted so a missing translation is a type error rather than a blank label.
 */

export type Locale = 'en' | 'zh-CN';

/** Every key the interface uses. `en` is the source of truth; other locales must match it. */
export const en = {
  'nav.collections': 'Collections',
  'nav.settings': 'Settings',
  'common.cancel': 'Cancel',
  'nav.brand': 'V7 CMS',
  'account.signedInAs': 'Signed in',
  'account.viaOauth': 'signed in with GitHub',
  'account.viaToken': 'access token',
  'account.signOut': 'Sign out',
  'account.signOutConfirm': 'Sign out of the editor?',
  'account.localFolder': 'Local folder',
  'account.localFolderHint': 'Editing files on this device',
  'account.disconnect': 'Close folder',

  'config.title': 'Configuration problems',

  'connect.title': 'Open a local repository',
  'connect.tabFolder': 'Local folder',
  'connect.tabProxy': 'Local proxy',
  'connect.tabGithub': 'Sign in with GitHub',
  'connect.tabToken': 'Access token',
  'connect.folderHint':
    'Pick your repository folder. The editor reads and writes the files directly — no server and no token — and nothing is committed until you push it yourself.',
  'connect.chooseFolder': 'Choose folder',
  'connect.proxyHint': 'Point the editor at a local proxy that reads and writes your repository.',
  'connect.githubHint':
    'Sign in with GitHub to read and write the repository through its API. Changes become commits.',
  'connect.tokenHint':
    'Paste a personal access token with repository write permission. It is kept in this browser only.',
  'connect.folderDenied': 'Permission to that folder was not granted. Choose it again.',
  'connect.connect': 'Connect',
  'connect.connecting': 'Connecting…',
  'connect.signIn': 'Sign in with GitHub',
  'connect.waiting': 'Waiting for GitHub…',
  'connect.checking': 'Checking…',
  'connect.remember': 'Remember on this device',
  'connect.howTo': 'How to connect',
  'connect.openRepo': 'Open {repo}',
  'connect.openLocal': 'Open a local repository',
  'connect.noFileSystem':
    'This browser cannot open a local folder. Use the local proxy instead, which works everywhere.',
  'connect.reopenFolder': 'Reopen the last folder',
  'connect.forgetFolder': 'Forget it',
  'connect.proxyCommand':
    'Run npx @v7-cms/proxy --root . in your repository. It prints a URL and a token; paste both here. It only listens on your own machine.',
  'connect.proxyUrl': 'Proxy URL',
  'connect.serving': 'Serving “{repo}”.',
  'connect.proxyToken': 'Token',
  'connect.patLabel': 'Personal access token',
  'connect.patHint':
    'Needs repository contents read and write. Create one under GitHub → Settings → Developer settings → Personal access tokens.',
  'connect.githubNotice':
    'Sign in with GitHub. The editor receives a token for your account and can only reach repositories you can already write to.',

  'action.save': 'Save',
  'action.saving': 'Saving…',
  'action.saved': 'Saved.',
  'action.delete': 'Delete',
  'action.new': 'New',
  'action.add': 'Add',
  'action.upload': 'Upload',
  'action.working': 'Working…',
  'action.moveUp': 'Move up',
  'action.moveDown': 'Move down',
  'action.editRich': 'Edit as rich text anyway',

  'list.empty': 'Nothing here yet.',
  'list.selectEntry': 'Select an entry, or create one.',
  'list.unknownCollection': 'Unknown collection',
  'list.addItem': 'Add',

  'field.optional': '(optional)',
  'field.reading': 'Reading',
  'field.body': 'Body',

  'notice.fieldsNeedAttention': 'field needs attention.',
  'notice.fieldsNeedAttentionPlural': 'fields need attention.',
  'notice.conflict': 'This file changed elsewhere. Reopen it before saving.',
  'notice.unchanged': 'No changes to save.',
  'notice.nothingEditable': 'This file has nothing editable in it.',

  'body.sourceOnly': 'Editing as source.',
  'body.richWarning': 'Rich text will reformat this file.',
  'body.reason.mdx': 'This file is MDX, which carries imports and components.',
  'body.reason.imports': 'This body contains an import or export.',
  'body.reason.jsx': 'This body contains a component.',
  'body.reason.html': 'This body contains HTML.',
  'body.reason.structuredFence': 'This body contains a diagram or other structured block.',
  'body.reason.math': 'This body contains display math.',
  'body.reason.indentedCode': 'This body contains an indented code block.',
  'body.reason.configured': 'This field is configured as source only.',

  'image.compressing': 'Compressing and removing metadata…',
  'image.noOutput': 'The image produced no output.',

  'preview.title': 'Preview',
  'preview.rendered': 'Markdown',
  'preview.site': 'Site',
  'preview.siteHint':
    'The real site, embedded from the preview origin in your config. It shows what is published, not your unsaved edits.',
  'preview.markdownHint': 'Markdown preview. The published page may lay this out differently.',
  'preview.inContextHint': 'Click text in the page to edit the field that produced it.',
  'preview.inContextNeedsPath':
    'In-context editing needs a pathTemplate so the editor can address this entry on your dev server.',
  'preview.open': 'Open in a new tab',
} as const;

export type TranslationKey = keyof typeof en;

/** A complete translation. Missing or extra keys are a compile error, not a runtime fallback. */
export type Dictionary = { readonly [K in TranslationKey]: string };
