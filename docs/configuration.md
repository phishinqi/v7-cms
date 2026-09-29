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

| Key                 | Meaning                                                      |
| ------------------- | ------------------------------------------------------------ |
| `backend`           | Where content lives. See below.                              |
| `media`             | Where uploads go.                                            |
| `collections`       | What the editor edits. At least one.                         |
| `locale`            | Interface language. Built in: `en`, `zh-CN`.                 |
| `editorialWorkflow` | Offer draft and review status.                               |
| `preview`           | Embed a development server, and how to build an entry's URL. |
| `plugins`           | Registered in code, not here; see [extending](extending.md). |

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
prefill photographic fields — it is never written to the file.

Because uploads are re-encoded through a canvas, every byte of metadata is dropped on the way in.
That is deliberate: a photograph's location should not be published because someone forgot.

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
