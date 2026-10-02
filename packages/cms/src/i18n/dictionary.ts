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
  'author.search': 'Search or add an author…',
  'author.choose': 'Choose an author',
  'author.invalidRegistry': 'Invalid author registry.',
  'tag.search': 'Search or add a tag…',
  'tag.createNamed': 'Create “{name}”',

  'tag.choose': 'Choose a tag',
  'tag.new': 'New tag',
  'tag.create': 'Create and add',
  'tag.remove': 'Remove {name}',
  'tag.hint': 'Select multiple tags or create one here. New tags are saved immediately.',
  'tag.invalidName': 'Tags must be at most 40 characters and cannot contain URL separators.',
  'tag.invalidRegistry': 'Invalid tag registry.',

  'category.new': 'New category',
  'category.name': 'Category name',
  'category.id': 'URL ID (optional)',
  'category.hint':
    'Saved immediately; cancelling the article keeps the category. Leave ID blank to generate one.',
  'category.create': 'Create and select',
  'category.invalidId': 'Use lowercase letters, digits and hyphens for the ID.',
  'category.duplicate': 'This category ID already exists.',

  'date.choose': 'Choose date',
  'date.today': 'Today',
  'date.now': 'Now',
  'date.zone': 'Time zone',
  'date.local': 'Browser local time',

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
    'Run the proxy from a v7-cms checkout: node packages/proxy/dist/cli.mjs --root . It prints a URL and a token; paste both here. It only listens on your own machine.',
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
  'field.filename': 'File name',

  'notice.fieldsNeedAttention': 'field needs attention.',
  'notice.fieldsNeedAttentionPlural': 'fields need attention.',
  'notice.conflict': 'This file changed elsewhere. Reopen it before saving.',
  'notice.unchanged': 'No changes to save.',
  'notice.nothingEditable': 'This file has nothing editable in it.',

  'format.title': 'Format',
  'format.missingFrontmatter':
    'This file has no frontmatter, so the whole document is treated as the body and the fields above cannot be filled in. Add a `---` block, or model it as a file collection with `source: true`.',
  'format.scalarFrontmatter':
    'The frontmatter is not a set of keys. Saving turns it into one and keeps the old text as a comment.',
  'format.bodyLooksLikeFrontmatter':
    'The body starts with `---`, which some tools read as the start of a frontmatter block.',
  'format.mixedLineEndings':
    'This file mixes CRLF and LF line endings, so saving changes lines you did not edit.',
  'format.noTrailingNewline': 'The file does not end with a newline.',
  'format.notFormatted': 'Prettier would reformat this file. Run `pnpm format` before committing.',
  'format.unavailable':
    'Prettier is not available from this backend, so formatting was not checked.',
  'format.check': 'Check formatting',

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

  'figure.title': 'Article illustrations',
  'figure.insert': 'Insert illustration',
  'figure.edit': 'Edit illustration',
  'figure.editExisting': 'Edit an illustration',
  'figure.image': 'Image',
  'figure.alt': 'Alternative text',
  'figure.caption': 'Caption',
  'figure.position': 'Article position',
  'figure.keepPosition': 'Keep current position',
  'figure.start': 'Start of article',
  'figure.end': 'End of article',
  'figure.afterHeading': 'After heading: {name}',
  'figure.afterParagraph': 'After paragraph: {name}',
  'figure.width': 'Display width (px)',
  'figure.height': 'Display height (px, optional)',
  'figure.align': 'Alignment',
  'figure.align.left': 'Left',
  'figure.align.center': 'Center',
  'figure.align.right': 'Right',
  'figure.align.wrap-left': 'Wrap text on right',
  'figure.align.wrap-right': 'Wrap text on left',
  'figure.invalidImage': 'Choose an image and add alternative text.',
  'figure.invalidSize': 'Width and height must be whole numbers between 80 and 1600 px.',
  'figure.update': 'Update illustration',
  'figure.remove': 'Remove illustration',

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
