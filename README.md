# v7-cms

A Git-based CMS for static sites. You describe your content in a config file; v7-cms gives you an
editor for it, and writes the changes back to your repository or your working directory.

Its defining rule is that **content you did not edit is not touched**. Opening a file and saving it
produces the identical bytes — same quoting, same flow style, same key order, same comments. That
matters more than it sounds: a CMS that reformats your files on save quietly breaks builds, and it
makes the editor unsafe to open.

> **Status: feature complete, early.** Every milestone below is done: the editor lists collections
> and entries, renders every field including a list of nested photo objects, and saves without
> disturbing what you did not touch. The interface itself is translated — `locale` picks the
> language of the editor chrome, independent of the languages your content carries — and the
> sidebar names the signed-in account and offers a way out of it. Bodies open in a rich editor or a source editor depending on
> what the file can survive. It talks to GitHub, to a local folder, or to a local proxy. Previews,
> the review workflow, plugins and theming are in. What it needs now is use.

## Why another one

Decap CMS is no longer actively maintained, and its editor cannot reuse its own `object`, `list`
or `richtext` field types inside custom fields — which rules out editing something like a photo
album, where each item is a nested object with mixed optional sub-objects. Keystatic and Sveltia
have the same limitation. v7-cms is built so that shape is a first-class citizen.

## How it works

```
your-site/
├─ cms.config.json          # collections, fields, backend
├─ content/
│  └─ albums/
│     └─ paper.md           # frontmatter + body, edited in place
└─ public/images/uploads/
```

## Packages

| Package            | What it is                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `@v7-cms/core`     | Config schema, field contract, the serialisation engine, storage interfaces. No DOM, so Node scripts can reuse it. |
| `@v7-cms/adapters` | Storage backends: GitHub, browser directory, local proxy, and an in-memory one used by tests.                      |
| `@v7-cms/cms`      | The editor application.                                                                                            |
| `@v7-cms/proxy`    | Optional local process for browsers without the File System Access API.                                            |

## Development

```sh
pnpm install
pnpm test          # unit and conformance tests
pnpm check         # types, all packages
pnpm lint
pnpm format        # prettier
```

## The fidelity engine

`@v7-cms/core/serialize` is where the guarantee lives, and it is the most heavily tested part of
the project. Its tests are golden files: real content from a real site, asserted to round-trip
byte-for-byte, then asserted to differ by exactly one line when one value is edited.

```ts
import { parseEntry, setValue, serializeEntry } from '@v7-cms/core/serialize';

const entry = parseEntry(readFileSync('content/albums/paper.md', 'utf8'));
setValue(entry, 'title', 'New title');
writeFileSync('content/albums/paper.md', serializeEntry(entry)); // only that line changed
```

Two details that a naive implementation gets wrong, and which this one handles:

- **Flow collection padding.** Files mix `[a, b]` and `{ a: b }`, sometimes on adjacent lines. The
  YAML writer has one global setting, so each collection's original spacing is recorded on parse
  and restored after writing.
- **Quoting.** `'2026-09-12'` and `2026-09-12` are different values to some consumers, so a scalar's
  original quote style is available to any field that needs to preserve it.

## Documentation

- [Getting started](docs/getting-started.md) — write a config, serve the editor, open a repository
- [Configuration](docs/configuration.md) — every option and field type
- [Authentication](docs/authentication.md) — access tokens and the OAuth relay
- [Workflow and deploying](docs/workflow-and-deploying.md) — drafts, review, extensions, and how to
  ship the editor
- [中文说明](docs/README.zh-CN.md)
- [Gap analysis](docs/gap-analysis.md) — what this does and does not do, measured against the
  four kinds of CMS people usually compare it to

## Backends

| Backend      | Needs                             | Works in                                   |
| ------------ | --------------------------------- | ------------------------------------------ |
| GitHub       | A token, or OAuth through a relay | Any browser                                |
| Local folder | Nothing                           | Chromium browsers (File System Access API) |
| Local proxy  | A one-line command                | Any browser                                |

The local folder is the nicest: no server, no token, and the editor reads and writes your files
directly through the browser's File System Access API. Pick the folder once and it is remembered;
permission is asked for again on each visit, which the API requires and which keeps the grant
honest.

The proxy exists because that API is Chromium-only. It is one small process, bound to loopback,
guarded by a token, and confined to the folder you point it at:

```sh
npx @v7-cms/proxy --root .
```

It prints a URL and a token to paste into the editor. It has no dependencies, no shell access, and
refuses to bind anything but loopback — it can write files in your repository, so it must never be
reachable from a network. Paths are resolved and checked, so a `../` or a symlink cannot escape
your repository, and that is covered by tests.

## The two-track body editor

A rich-text editor normalises Markdown: it re-wraps emphasis, realigns tables, changes fence
styles. That is fine for prose and fatal for MDX, which carries ESM imports and JSX a Markdown
editor does not model at all. So every body is classified before it is opened, and anything the
rich editor would not round-trip is edited as source instead:

| Body contains                                                         | Editor    |
| --------------------------------------------------------------------- | --------- |
| Prose, headings, lists, links, images, ordinary code fences           | Rich text |
| MDX (any `.mdx` file), `import`/`export`, JSX, HTML blocks            | Source    |
| A structured fence (`mermaid`, `abc`, …), display math, indented code | Source    |

The bias is deliberate: when in doubt, source. A false positive costs the author a nicer editor;
a false negative silently corrupts their file. The author can still force rich text, but that is an
explicit act with a warning, never something that happens by opening a file.

`classifyBody()` in `@v7-cms/core` is the decision, and it is tested against real content from a
real blog — the files that would be damaged are the fixtures.

## Preview

The editor shows the body beside the form, in one of two modes. The Markdown preview is always
available and renders the body as the site would, including diagrams and math. The site preview
embeds your development server in an iframe when the config names one, which is the only way to
see the real layout.

The diagram engines are fetched from a CDN the first time a preview actually contains one. Mermaid
alone is several megabytes of diagram code, and bundling it turned a 500 kB editor into an 18 MB
directory of 67 chunks. A post with no diagram downloads none of it — that is asserted by a test.

## Bundle size

The built editor is **646 kB gzipped** as a single self-contained file, plus 10 kB of CSS. That is
the honest cost of shipping two real editors — Tiptap/ProseMirror for rich text and CodeMirror for
source — with React bundled in, since a host page loads it with a plain `<script type="module">`
and resolves no bare specifiers of its own. It is in the same range as Sveltia and Decap. The
diagram engines are not in it; they are fetched from a CDN only when a preview needs one.

## Roadmap

- [x] **M0** Workspace, config schema and loader, field contract, storage interface, memory adapter
- [x] **M1** Fidelity engine, with golden tests against real content
- [x] **M2** Editor shell, entry list, built-in field controls, end-to-end tests
- [x] **M3** Source editor and rich text, with the two-track rule
- [ ] **M4** GitHub backend and both auth flows
- [x] **M5** Local backends: browser directory and proxy process
- [x] **M6** Markdown preview and in-site preview
- [x] **M7** Draft branches and review workflow
- [x] **M8** Custom field types and theming
- [x] **M9** Mobile
- [x] **M10** Release bundle, documentation

## License

MIT. See [LICENSE](LICENSE).
