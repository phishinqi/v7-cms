# v7-cms

A Git-based CMS for static sites. You describe your content in a config file; v7-cms gives you an
editor for it, and writes the changes back to your repository or your working directory.

Its defining rule is that **content you did not edit is not touched**. Opening a file and saving it
produces the identical bytes — same quoting, same flow style, same key order, same comments. That
matters more than it sounds: a CMS that reformats your files on save quietly breaks builds, and it
makes the editor unsafe to open.

> **Status: early but usable.** The editor runs: it lists collections and entries, renders every
> field — including a list of nested photo objects — and saves without disturbing what you did not
> touch. It currently talks to an in-memory backend; GitHub and local directory backends, rich
> text and the review workflow are next. See [Roadmap](#roadmap).

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

## Roadmap

- [x] **M0** Workspace, config schema and loader, field contract, storage interface, memory adapter
- [x] **M1** Fidelity engine, with golden tests against real content
- [x] **M2** Editor shell, entry list, built-in field controls, end-to-end tests
- [ ] **M3** Source editor and rich text, with the two-track rule
- [ ] **M4** GitHub backend and both auth flows
- [ ] **M5** Local backends: browser directory and proxy process
- [ ] **M6** Markdown preview and in-site preview
- [ ] **M7** Draft branches and review workflow
- [ ] **M8** Custom field types and theming
- [ ] **M9** Mobile
- [ ] **M10** CDN release, documentation

## License

MIT. See [LICENSE](LICENSE).
