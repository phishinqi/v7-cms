# Authentication

Two ways to let the editor reach a GitHub repository. A personal access token needs no server and
suits one author; OAuth suits a deployed editor where authors should not handle tokens.

The editor never holds a client secret. In OAuth mode a small relay holds it, which is what makes
the flow safe to ship as a static bundle.

## Personal access token

Works everywhere, needs nothing else.

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained
   tokens** → **Generate new token**.
2. **Repository access**: only select repositories → the repository you edit.
3. **Permissions** → **Repository permissions** → **Contents**: **Read and write**. Nothing else is
   needed.
4. Generate, copy the token, and paste it into the editor.

The token is kept in `sessionStorage` by default, so it dies with the tab. "Remember on this
device" moves it to `localStorage`, which outlives the session — reasonable on your own machine,
worth avoiding on a shared one. There is no encryption, because anything decryptable in the same
browser is not a secret worth the pretence.

A classic token (`ghp_…`) works too; it needs the `repo` scope.

## OAuth through a relay

### Why a relay is needed

OAuth needs a client secret to exchange the authorization code for a token. A static page cannot
hold one — anyone can read the bundle — so the exchange happens on a small server. The editor opens
a popup, the relay does the exchange, and the token comes back over `postMessage`.

### 1. Create the GitHub App

GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**.

| Field                      | Value                                                       |
| -------------------------- | ----------------------------------------------------------- |
| Application name           | anything, e.g. `v7-cms`                                     |
| Homepage URL               | where the editor is served, e.g. `https://blog.example.com` |
| Authorization callback URL | `https://<relay-host>/api/callback`                         |

The callback is the **relay's** address, not the editor's. Copy the **Client ID**, then
**Generate a new client secret** and copy that too.

> A GitHub App or an OAuth App both work. An OAuth App is simpler and is what the relay expects by
> default.

### 2. Deploy the relay

Any host that can run a small function will do. Two options:

**Reuse the theme's relay.** `astro-theme-v7` ships
`functions/api/[[path]].js` plus `src/server/content-services.mjs`, a Cloudflare Pages Function
that already implements `/api/auth` and `/api/callback`, including the OAuth state cookie and a
repository write-permission check. Deploy the theme to Cloudflare Pages and point `authBase` at it:

```json
{
  "backend": {
    "name": "github",
    "repo": "owner/repo",
    "authBase": "https://your-theme.example",
    "authEndpoint": "api/auth"
  }
}
```

`authEndpoint` matters here. The editor asks for `<authBase>/auth` by default, but the theme's
relay is a Pages Function under `functions/api/`, so it is reachable at `/api/auth`. Without the
key the popup loads a 404 and sign-in cannot start.

**Or run the community relay.** [`sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth)
speaks the same protocol and deploys to Cloudflare Workers in a few minutes.

Either way the relay needs these environment variables:

| Variable               | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| `GITHUB_CLIENT_ID`     | from step 1                                                          |
| `GITHUB_CLIENT_SECRET` | from step 1 — store it as a **secret**, never in the repository      |
| `GITHUB_REPO`          | `owner/repo`, for the write-permission check                         |
| `SITE_ORIGIN`          | where the editor is served, so the relay replies to the right origin |

Set the secret through the platform, not a file:

```sh
wrangler pages secret put GITHUB_CLIENT_SECRET
```

### 3. Point the editor at it

```json
{
  "backend": {
    "name": "github",
    "repo": "owner/repo",
    "branch": "main",
    "authBase": "https://your-relay.example",
    "authEndpoint": "auth"
  }
}
```

With `authBase` set, the connect screen offers **Sign in with GitHub** as well as the token option.
Without it, only the token option appears.

### 4. Add collaborators

Everyone who edits needs write access to the repository:

GitHub → the repository → **Settings** → **Collaborators** → **Add people**.

The relay checks write permission before issuing a token, so someone without it is refused at
sign-in rather than discovering it on their first save.

## What the protocol looks like

Documented so a relay can be written from scratch. The editor:

1. Opens `<authBase>/<authEndpoint>?provider=github&site_id=<origin>` in a popup, where
   `authEndpoint` defaults to `auth`.
2. Listens for messages, and **ignores any whose origin is not the relay's** — otherwise any page
   could hand the editor a token.
3. On `authorizing:github` focuses the popup, and on the success message below reads the token.

The relay replies with a string:

```
authorization:github:success:{"token":"…","provider":"github"}
```

That shape is not arbitrary: it is what Decap and its relays already speak, so an existing relay
works unchanged.

## Things worth knowing

- **A token is a password.** Anyone who has it can write to every repository it covers. Prefer a
  fine-grained token limited to one repository, and revoke it when you are done.
- **The editor talks to GitHub directly.** Nothing is proxied through the relay except the initial
  exchange; your content never passes through a third party.
- **Local modes need no authentication at all.** If you only ever edit a folder on your own machine,
  skip this page.
