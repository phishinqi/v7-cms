# Workflow, extending and deploying

## Drafts and review

Two things are called "draft", and conflating them causes real confusion:

- The **frontmatter flag** (`draft: true`) is a build-time exclusion. Your site will not publish
  that entry, whatever the editor says. It is your switch, and the editor never changes it on your
  behalf.
- The **workflow status** is where an entry is in review: draft, in review, or published. It lives
  in the branch or a status file, never in frontmatter.

On GitHub a draft is a branch named `cms/<path>`, created from the published branch the first time
you need it. Review is a pull request against that branch. Publishing is the merge, and merging is
a Git operation the editor does not perform for you — it opens the way and leaves the decision to
you.

On a local folder there are no branches, so status is recorded in `.v7-cms/workflow.json`. Ignore
that path in Git. Review there means "marked for review", and cannot stop anyone editing the same
files; that is the honest limit of a plain folder.

## Extending

A plugin is a plain object registered once at startup:

```ts
import { registerPlugin } from '@v7-cms/cms';

registerPlugin({
  name: 'my-site',
  fields: [myFieldType],
  renderers: [myPreviewRenderer],
  theme: { accent: '#964630', heading: 'Georgia, serif' },
  setup({ root, applyTheme }) {
    // Anything else, once the editor is mounted.
  },
});
```

### A field type

A field type says how to read a stored value, how to write it back, and what counts as empty. It
describes no UI, which is what lets the same type work in the browser and in a Node script:

```ts
const colour: FieldType<string> = {
  name: 'colour',
  isEmpty: (value) => !value,
  validate: (value, options, path) =>
    /^#[0-9a-f]{6}$/i.test(value)
      ? []
      : [{ level: 'error', message: `${options.label} must be a hex colour.`, path: path.path }],
  defaultValue: () => '#000000',
};
```

Register it, then use `"widget": "colour"` in the config.

### A preview renderer

```ts
const renderer: PreviewRenderer = {
  name: 'my-diagram',
  matches: ({ language }) => language === 'mydiagram',
  async render(root, { theme }) {
    // Imported here, not at module scope: a preview only pays for what it contains.
    const { draw } = await import('./my-diagram.js');
    for (const code of root.querySelectorAll('code.language-mydiagram')) {
      const pre = code.closest('pre');
      if (!pre) continue;
      const host = document.createElement('div');
      host.className = 'preview-diagram';
      pre.replaceWith(host);
      try {
        draw(code.textContent ?? '', host, theme);
      } catch {
        // Keep the source visible rather than showing an empty box.
        host.textContent = code.textContent ?? '';
        host.classList.add('preview-error');
      }
    }
  },
};
```

Import heavy renderers inside `render`, not at module scope: a preview only pays for what it
contains.

### Theming

Design tokens are applied as CSS custom properties on the editor's root, so a consumer restyles it
without writing CSS or knowing any class names:

```ts
registerPlugin({ name: 'theme', theme: { accent: '#7d8a74', radius: '6px' } });
```

Available tokens: `paper`, `surface`, `ink`, `muted`, `accent`, `line`, `danger`, `heading`, `ui`,
`mono`, `radius`.

## Deploying

The editor is a build artifact. There are two ways to serve it.

### From a release

The v7-cms release workflow attaches the built bundle to a version tag, so nothing has to be built
at deploy time:

```sh
curl -L -o public/cms/v7-cms.js \
  https://github.com/phishinqi/v7-cms/releases/download/v0.0.0-alpha.1/v7-cms.js
curl -L -o public/cms/cms.css \
  https://github.com/phishinqi/v7-cms/releases/download/v0.0.0-alpha.1/cms.css
```

That is what `astro-theme-v7` does in `scripts/copy-cms.mjs`, which prefers a local checkout when
one is present so editor development does not need a release for every change.

### From a local build

```sh
git clone https://github.com/phishinqi/v7-cms
cd v7-cms && pnpm install && pnpm --filter @v7-cms/cms build
```

The output is `packages/cms/dist/`: `v7-cms.js`, `cms.css`, and a source map.

### Notes

- **The bundle is ~650 kB gzipped.** That is two real editors plus React, and it is loaded once, on
  the editor page only. Your published pages do not include any of it.
- **Serve it from the same origin as the site** if you use OAuth, so the relay's origin check and
  your cookie policy stay simple.
- **Keep `public/cms/` out of your type checker.** A multi-megabyte bundle in its input makes
  `astro check` run out of memory; add it to `tsconfig` `exclude`, and to your lint and format
  ignore lists.
- **Never commit the built bundle.** It is regenerated, and a stale one is worse than none.
