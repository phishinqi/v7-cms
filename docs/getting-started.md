# Getting started

v7-cms is a Git-based editor for a static site. You describe your content in a config file, and
the editor reads and writes those files — in a repository, or in a folder on your machine.

## 1. Write a config

Create `cms.config.json` at the root of your site:

```json
{
  "backend": { "name": "local", "local": { "kind": "fs-access" } },
  "media": {
    "provider": "repo",
    "repoPath": "public/images/uploads",
    "publicPath": "/images/uploads",
    "maxEdge": 2400
  },
  "collections": [
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
      "fields": [
        { "name": "title", "widget": "string", "required": true },
        { "name": "description", "widget": "text", "required": true },
        { "name": "slug", "widget": "string", "required": true },
        { "name": "pubDate", "widget": "datetime", "required": true },
        { "name": "draft", "widget": "boolean", "required": false },
        { "name": "body", "widget": "markdown" }
      ]
    }
  ]
}
```

`folder` is where entries live. `contentField` names the field holding the body, so the rest are
frontmatter. `identifierField` names the field an entry is known by.

## 2. Serve the editor

The editor is a single file. Load it from the release that matches the version you want:

```html
<link rel="stylesheet" href="/cms/cms.css" />
<div id="cms-root"></div>
<script type="module">
  import { mount } from '/cms/v7-cms.js';
  const config = await fetch('/cms.config.json').then((r) => r.json());
  mount({ container: '#cms-root', config });
</script>
```

`release.sh` in this repository does the fetching; a theme usually wraps it in a small script.

## 3. Open a repository

Which options you see depends on `backend`:

| `backend.name` | Options                                       |
| -------------- | --------------------------------------------- |
| `local`        | A folder on your machine, or a local proxy    |
| `github`       | Sign in with GitHub, or paste an access token |

### A local folder

Needs nothing else. Pick your repository folder and the editor reads and writes it directly.
Only Chromium browsers implement the File System Access API, so this option is hidden elsewhere.

### The local proxy

Works everywhere, at the cost of one small process:

```sh
npx @v7-cms/proxy --root .
```

It prints a URL and a token; paste both into the editor. It listens on loopback only and refuses
to bind anything else, because it can write files in your repository.

### GitHub

```json
{
  "backend": {
    "name": "github",
    "repo": "owner/repo",
    "branch": "main",
    "authBase": "https://your-site.example"
  }
}
```

`authBase` is a small relay that holds your OAuth client secret — see
[authentication](authentication.md). Without it, only the access token option is offered, which
works everywhere and needs no server.

## 4. Edit

The editor lists entries by their identifier, opens one, and renders every field. Where it gets
interesting is the body.

## The body editor

A rich-text editor normalises Markdown: it re-wraps emphasis, realigns tables, changes fence
styles. That is fine for prose and fatal for MDX, which carries ESM imports and JSX a Markdown
editor does not model at all. So every body is classified before it is opened:

| Body contains                                                         | Editor    |
| --------------------------------------------------------------------- | --------- |
| Prose, headings, lists, links, images, ordinary code fences           | Rich text |
| MDX (any `.mdx` file), `import`/`export`, JSX, HTML blocks            | Source    |
| A structured fence (`mermaid`, `abc`, …), display math, indented code | Source    |

The bias is deliberate: when in doubt, source. A false positive costs you a nicer editor; a false
negative silently corrupts your file. You can still force rich text, but that is an explicit act
with a warning.

## What is never touched

Opening a file and saving it produces the identical bytes: same quoting, same flow style, same key
order, same comments. Only fields whose value actually changed are rewritten, and a field you clear
is removed rather than written as an empty value.

This is the guarantee the whole design exists for, and it is the most heavily tested part of the
project — its tests are real content from a real site, asserted to round-trip byte for byte.

## Albums, and why this exists

Decap CMS cannot reuse its own `object`, `list` or `richtext` field types inside a custom field.
Neither can Keystatic or Sveltia. That rules out editing something like a photo album, where each
item is a nested object with mixed optional sub-objects. Here it is ordinary config:

```json
{
  "name": "images",
  "widget": "list",
  "fields": [
    { "name": "src", "widget": "image", "required": true },
    { "name": "alt", "widget": "string", "required": true },
    {
      "name": "photo",
      "widget": "object",
      "required": false,
      "collapseEmpty": true,
      "fields": [
        { "name": "camera", "widget": "string", "required": false },
        { "name": "iso", "widget": "number", "required": false }
      ]
    }
  ]
}
```

`collapseEmpty` is what keeps an all-blank sub-object out of the file, so an optional block that
nothing was typed into does not appear at all.

## Next

- [Configuration](configuration.md) — every option, and the field types
- [Authentication](authentication.md) — tokens and the OAuth relay
- [Workflow](workflow.md) — drafts, review and publishing
- [Extending](extending.md) — field types, preview renderers and theming
- [Deploying](deploying.md) — serving the editor from your own site
