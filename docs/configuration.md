# Configuration

One file, passed to `mount()`. There is no `config.yml` to find and no build step: whatever you
hand the editor is what it uses.

## Top level

```json
{
  "backend": { "name": "local", "local": { "kind": "fs-access" } },
  "media": { "provider": "repo" },
  "collections": [],
  "locale": "en",
  "editorialWorkflow": true,
  "preview": { "devServerURL": "http://localhost:4321", "pathTemplate": "/posts/{{slug}}/" },
  "plugins": []
}
```

| Key                 | Meaning                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `backend`           | Where content lives. See below.                                  |
| `media`             | Where uploads go.                                                |
| `collections`       | What the editor edits. At least one.                             |
| `locale`            | Language of the editor's own interface. Built in: `en`, `zh-CN`. |
| `editorialWorkflow` | Offer draft and review status.                                   |
| `preview`           | Embed a development server, and how to build an entry's URL.     |
| `plugins`           | Registered in code, not here; see [extending](extending.md).     |

### `locale`

The editor chrome speaks this language: the sidebar headings, the connect screen, the save and
delete buttons, the notices and the reasons the source editor was chosen. It is independent of the
language your _content_ carries — an `i18n-string` field renders one input per locale present in
the value, whatever the editor itself is set to.

```json
{ "locale": "zh-CN" }
```

A value the editor does not ship falls back to `en` rather than rendering blank labels. Adding a
language means adding a dictionary beside `packages/cms/src/i18n/locales.ts`; the `Dictionary` type
is derived from the English keys, so a missing translation is a compile error.

## `backend`

```json
{ "name": "local", "local": { "kind": "fs-access" } }
{ "name": "local", "local": { "kind": "proxy", "url": "http://127.0.0.1:5177" } }
{ "name": "local", "local": { "kind": "memory", "files": {} } }
{ "name": "github", "repo": "owner/repo", "branch": "main", "authBase": "https://relay.example" }
```

`memory` backs the tests, the demos and any preview, and touches nothing.

## `media`

```json
{
  "provider": "repo",
  "repoPath": "public/images/albums/{{slug}}",
  "publicPath": "/images/albums/{{slug}}",
  "maxEdge": 2400,
  "exif": true
}
```

`repoPath` is where files are written, relative to the repository; `publicPath` is what the site
serves them from. Both take `{{slug}}` and `{{collection}}`, so each album can keep its images
together. `maxEdge` bounds the long edge on upload. `exif: true` reads EXIF from an upload to
prefill photographic fields — it is never written to the file. Prefilling defaults to enabled;
set `exif: false` to disable it. Successful uploads fill empty declared `date`, camera, lens,
focalLength, aperture, shutter, iso and software fields, including fields inside `photo`.
Existing nonempty values are preserved. Files without EXIF cannot provide these values.
GPS is never copied. Existing compressed images need the original file uploaded again.

Because uploads are re-encoded through a canvas, every byte of metadata is dropped on the way in.
That is deliberate: a photograph's location should not be published because someone forgot.

### Upload destinations

`provider: "repo"` writes image bytes through the connected content backend to `repoPath` and returns a URL under `publicPath`. A collection may override these settings; `{{slug}}` and `{{collection}}` are expanded before writing. Omitting overrides uses one fixed folder for all uploads.

For a separate GitHub repository:

```json
{
  "provider": "github",
  "repo": "owner/media",
  "branch": "main",
  "repoPath": "images",
  "publicPath": "https://img.example.com/images"
}
```

The current GitHub token must have write access to the media repository. That repository needs public image hosting matching `publicPath`; upload success does not imply a static hosting deployment has completed.

For R2 through an authenticated media API:

```json
{ "provider": "r2", "endpoint": "/api/media" }
```

The CMS sends a multipart POST with the GitHub Bearer token, JSON `metadata` (`name`, `color`, `sizes`), and `file-<width>` WebP parts. Each size contains `width`, `height`, and `field`. The response must include an HTTPS `src`, positive integer `width` and `height`, and optionally `srcset`. The theme's Pages Function implements this contract. Remote endpoints must implement CORS and accept the editor origin; only configure a trusted endpoint because it receives the token. Direct S3 endpoints and browser-side storage secrets are not supported; the older `s3` placeholder now reports a configuration error.

The image control updates the field only after storage succeeds. Nested `src` fields update declared sibling dimensions, colour and responsive URLs. Uploading is immediate, before saving the entry; cancelling an edit or removing a reference does not delete the uploaded asset. Local file backends need no token for `repo`; remote modes require GitHub authentication. R2 bucket setup and the theme's build variables are documented in the theme repository's `docs/media-storage.md`.

## The account panel

A backend may report who it is acting as by implementing `account()`. When it does, the sidebar
shows the login name, how the session was obtained (GitHub sign-in or an access token), and a sign
out button that clears the stored token and returns to the connect screen.

```ts
interface AccountInfo {
  login?: string;
  name?: string;
  avatar?: string;
  via: 'oauth' | 'token';
  repo?: { owner: string; repo: string; branch: string };
}

interface StorageAdapter {
  /** Optional. Absent means "this backend has no account". */
  account?(): Promise<AccountInfo | undefined>;
}
```

It is optional because it is not universal: a folder on disk has no account and neither does the
in-memory backend, so a local author sees a plain label where the sign-out button would be. A
lookup that fails also leaves the panel off — by the time it runs the editor is already usable, and
losing the account name must not blank the interface.

GitHub and proxy backends implement it; the panel reports `via` so the author can tell what signing
out will drop.

## In-context editing

With `preview.editAttribute` set, the embedded site preview becomes editable in place: the editor
outlines whatever the page marked, and clicking a marked element focuses the field that produced it.

A theme opts in by rendering that attribute on the element showing each field. The value is the
dotted frontmatter path:

```html
<h1 data-v7-field="title">{title}</h1>
<p data-v7-field="description">{description}</p>
<img data-v7-field="cover.src" src="{cover.src}" />
```

```json
{
  "preview": {
    "devServerURL": "http://localhost:4321",
    "pathTemplate": "/posts/{{slug}}/",
    "editAttribute": "data-v7-field"
  }
}
```

Nothing is guessed. An editor that inferred which node showed which field would be wrong often
enough to be worse than no feature, so a page with no marked nodes is simply a preview.

**Origins.** The editor injects the bridge when the frame is same-origin — the usual case, since
`/admin/` is served by the same dev server that renders the site. When they differ (a deployed
editor pointing at a local dev server) the injection cannot reach in, and the site serves the
bridge itself:

```ts
import { bridgeScript } from '@v7-cms/cms';

const script = bridgeScript({ attribute: 'data-v7-field', accent: '#964630' });
```

**What a click does.** It reports the path; the editor scrolls to the matching `[data-field]`
control and focuses its input. Only the first segment of a nested path is used, because a form
control is addressed by its top-level field — `cover.alt` opens `cover`. A click also cancels the
default, so following a link out of the frame never loses the author's place.

**What it does not do.** It changes field _values_, never file structure. The body still goes
through the two-track decision, and MDX still opens in the source editor.

## `collections`

Two kinds. A `fields` collection holds many entries in a folder; a `file` collection edits one
named file.

### `fields`

```json
{
  "kind": "fields",
  "name": "posts",
  "label": "Posts",
  "folder": "content/posts",
  "extension": "md",
  "format": "frontmatter",
  "identifierField": "slug",
  "contentField": "body",
  "nested": true,
  "create": true,
  "fields": []
}
```

| Key               | Meaning                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `folder`          | Where entries live. Nested folders are read when `nested` is true.                |
| `extension`       | What new entries are named. The editor reads both `.md` and `.mdx`.               |
| `identifierField` | The field that names an entry. Defaults to `slug`, falling back to the file name. |
| `contentField`    | The field holding the body. Everything else is frontmatter.                       |
| `create`          | Whether the editor offers to create entries. Defaults to true.                    |

### `file`

```json
{
  "kind": "file",
  "name": "settings",
  "label": "Site settings",
  "files": [{ "name": "site", "label": "Site", "file": "site.config.json", "inferSchema": true }]
}
```

`inferSchema` derives the form from the file's current contents, which is how a settings JSON stays
editable without a hundred lines of config. `fieldOverrides` refines the result by path, with `*`
matching one segment:

```json
{
  "inferSchema": true,
  "fieldOverrides": {
    "nav.*.label": { "widget": "i18n-string" },
    "startedAt": { "widget": "datetime", "format": "YYYY-MM-DD" }
  }
}
```

#### `source`: for files that are documents, not data

A `file` collection assumes its file is structured data — JSON it can parse into a form. Some files
are not. An MDX page's content _is_ the whole file: it has no frontmatter, so there are no keys to
form, and parsing it would either fail or invent a shape the author never wrote. Mark those files
with `source: true` and the editor shows one source editor over the entire document, saved byte for
byte:

```json
{
  "kind": "file",
  "name": "pages",
  "label": "Pages",
  "format": "yaml",
  "files": [
    { "name": "about", "label": "About", "file": "content/pages/about.zh.mdx", "source": true }
  ]
}
```

| Key           | Meaning                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| `source`      | Edit the whole file as text. Ignores `fields`, `inferSchema` and `fieldOverrides`. |
| `inferSchema` | Derive the form from the file's contents.                                          |
| `fields`      | Declare the form instead of inferring it.                                          |

A body-only Markdown file belongs here rather than in a `fields` collection with a `contentField`.
Under a `fields` collection a file with no frontmatter has no values, so the editor shows one body
box and none of the declared fields — and the entry list shows a file name where a title should be.

## Fields

Every field has `name`, `widget` and `label`, and optionally `required`, `hint` and `default`.

| Widget        | Value          | Notes                                                     |
| ------------- | -------------- | --------------------------------------------------------- |
| `string`      | text           | One line.                                                 |
| `text`        | text           | Several lines.                                            |
| `number`      | number         |                                                           |
| `boolean`     | true/false     | `false` is written, not omitted.                          |
| `select`      | text           | Needs `options`.                                          |
| `datetime`    | text           | Left as written, so `'2026-09-12'` stays quoted.          |
| `object`      | object         | Needs `fields`.                                           |
| `list`        | array          | `fields` for objects, `field` for scalars.                |
| `relation`    | text           | A value from another collection, or from a file registry. |
| `i18n-string` | object         | `{ "zh-CN": "…", "en": "…" }`.                            |
| `image`       | text or object | With `fields`, becomes an image object.                   |
| `markdown`    | text           | Rich text, with a source fallback.                        |
| `source`      | text           | Always source. For MDX.                                   |

### Blank means unset

A field left empty is **removed from the file**, not written as an empty value. This matters more
than it sounds: many site schemas treat a missing key and an empty one differently. The same rule
applies to `object` with `collapseEmpty: true`, where a block whose children are all blank does not
appear at all.

### Pattern

```json
{
  "name": "slug",
  "widget": "string",
  "pattern": ["^[a-z0-9-]+$", "Lowercase letters and hyphens."]
}
```

The message is what the author sees, so it should say what to do.

## Preview

```json
{ "devServerURL": "http://localhost:4321", "pathTemplate": "/posts/{{slug}}/" }
```

With both set, the preview panel offers the real site in an iframe as well as the Markdown view.
`pathTemplate` takes `{{slug}}` and `{{collection}}`; if a placeholder cannot be filled, the site
option is hidden rather than pointing at a broken URL.

## Format checks

The editor reports two kinds of formatting problem, in the panel above the fields. Neither of them
blocks Save: validation blocks Save because a bad value would be written wrong, while a format note
describes something already true about the file, and refusing to save a file the author opened
deliberately would be worse.

**Shape checks** always run, in the browser, with no dependency. They catch the things that break a
file rather than the things that merely look wrong:

| Check                         | Fires when                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing-frontmatter`         | The collection declares `contentField` but the file has no frontmatter, so the whole document would become the body and no declared field could be filled in. |
| `scalar-frontmatter`          | The frontmatter is not a mapping. Saving promotes it, keeping the old text as a comment.                                                                      |
| `body-looks-like-frontmatter` | The body opens with `---`. Safe, but one bad edit from being misread.                                                                                         |
| `mixed-line-endings`          | The file mixes CRLF and LF, so saving changes lines you did not edit.                                                                                         |
| `no-trailing-newline`         | Prettier and most tooling want a file to end with one.                                                                                                        |

**Prettier itself** is asked for through the backend, because a config is a file that can import
plugins, so only a process with a filesystem can evaluate it. The local proxy exposes it:

```text
POST /api/format   { "paths": ["content/posts/one.md"] }
  →  { "checked": 1, "issues": [{ "path": "…", "formatted": false, "firstDiffLine": 12 }] }
```

It answers "differs, and where" and never returns reformatted text. Handing back the formatted file
would turn a lint into an auto-formatter, and silently rewriting a file the author did not ask to
change is the behaviour this CMS exists not to have. Run `pnpm format` yourself to apply it.

Backends that cannot answer — GitHub, a browser folder — leave `checkFormat` off entirely and the
editor shows no Prettier advice rather than guessing.

### GitHub image CDN

For a public media repository, set `publicPath` to
`https://cdn.jsdelivr.net/gh/owner/media@main/images` (replace repository, branch and directory).
Uploads still go directly to GitHub; only image reads use the CDN. Private repositories are not supported
by this public URL. New uploads have unique names; replacing a file at the same URL can leave cached
content until the CDN refreshes. jsDelivr availability varies by network; a custom image domain remains
an alternative. Changing this prefix affects new uploads, not existing content URLs.

### Date and time fields

`widget: "datetime"` shows a calendar and time picker, with a **Now** shortcut.
`format: "YYYY-MM-DD"` shows a date-only picker with **Today**. Existing timestamp offsets
are preserved; new timestamps use the browser local time zone, shown under the field.
Opening a document does not change its date. Optional fields can be cleared.
