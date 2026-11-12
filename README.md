# homepage

Personal homepage for [paul.wtf](https://paul.wtf). German and English, dark-only, styled after the »zen« variant of my quickshell/Hyprland desktop theme ([dotfiles](https://github.com/paul-wtf/dotfiles)): opaque Catppuccin-Mocha surfaces, zero borders, teal accent, JetBrains Mono, the desktop's screen frame with concave viewport corners, and the nav as a numbered workspace switcher.

## Stack

Astro 7 (static), TypeScript, Vanilla JS for the interactive bits (desktop mode, terminal, live bar). nginx for serving, plain Kubernetes manifests for deployment.

Design spec: [`docs/superpowers/specs/2026-05-03-homepage-design.md`](docs/superpowers/specs/2026-05-03-homepage-design.md)
Implementation plan: [`docs/superpowers/plans/2026-05-03-homepage.md`](docs/superpowers/plans/2026-05-03-homepage.md)

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:4321
pnpm astro check  # type-check
pnpm build        # outputs dist/
pnpm preview      # serves dist/ locally
```

### Languages

German is served at `/`, English at `/en` and `/en/404`. Both are built from the same components. Every text lives in `src/data/`: content as a field with a `de` and an `en` value, interface strings in the dictionary `src/data/ui.ts`. The terminal reads the same files, so a text changes in one place for the page, the desktop windows and the commands. `tests/e2e/i18n.spec.ts` fails when a text or a key exists in only one language.

The page never redirects by browser language. Mode and theme are stored per origin and therefore apply to both languages. `nginx.conf` serves `/en` and `/en/404` without a redirect and answers unknown paths below `/en/` with the English 404 page.

### Project data from GitHub

`astro build` asks the GitHub API for the latest release tag and the date of the last commit of every project and renders them on the cards. A request that fails or runs into the rate limit leaves those fields out; the build still succeeds. Two environment variables change this:

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Sent as a bearer token, which lifts the limit of 60 unauthenticated requests per hour. The release workflow passes it to the image build as the secret `github_token`. |
| `PROJECT_META_FILE` | Path to a JSON file used in place of the API (`{"<project name>": {"release": "…", "lastCommit": "…"}}`). The e2e tests and CI build with `tests/fixtures/project-meta.json` so they never touch the network. |

### Regenerate the project previews

`Projects.astro` matches each preview to its featured project by filename
(`<project.name>-preview.webp` in `src/assets/`), so a new featured project gets
its screenshot the moment the asset exists — no code change needed.

Playwright needs a Chromium-family browser. On NixOS the bundled Chromium won't
run, so point `BROWSER_BIN` at one instead of `playwright install chromium`:

```bash
# linkhop — its live site is the preview
BROWSER_BIN=$(which brave) pnpm capture-previews         # -> linkhop-preview.webp

# tidalwave — its public page is a login gate, so we shoot the dashboard from a
# locally-running frontend with a mocked stats API (see the script header):
#   (cd ../tidalwave/frontend && pnpm install && pnpm dev --port 4319)
TW_URL=http://localhost:4319 BROWSER_BIN=$(which brave) pnpm capture-tidalwave-demo
```

Both scripts leave a preview alone when the new shot shows the same picture, so a run without visible changes produces no diff. The workflow `.github/workflows/previews.yml` runs them every Monday (and on demand) and opens a pull request from `chore/refresh-previews` when an image changed. It needs the repository setting "Allow GitHub Actions to create and approve pull requests".

### Public key

`public/pubkey.asc` is the public part of the commit signing key, linked from the contact section. Export it again after extending or adding a subkey:

```bash
gpg --armor --export "$(git config user.signingkey | tr -d '!')" > public/pubkey.asc
```

The fingerprint in `src/data/contact.ts` belongs to the primary key. `tests/e2e/gpg.spec.ts` computes it from the published file and fails when the two differ.

### Regenerate the OG image

```bash
node scripts/generate-og.mjs            # writes public/og-image.png and og-image-en.png
```

The script asks for JetBrains Mono and falls back to DejaVu Sans Mono when fontconfig does not find it.

## Build & run container locally

```bash
docker build -t homepage:dev .
docker run --rm -p 8080:8080 homepage:dev
```

## Status API

`api/` is a small FastAPI service behind `/api/status`, which the live bar polls. It returns the current Last.fm track, server load from Prometheus and the weather from Open-Meteo, each cached for a short time. A source that fails or has no data comes back as `null`. `projects` maps each project name to `up` or `down`, from a GET on its URL once a minute; an answer below 400 counts as up, and the live badge of the project shows the result.

```bash
cd api
uv sync
uv run uvicorn homepage_api.main:app --reload --port 8080
uv run pytest
uv run ruff check
```

`GET /api/healthz` returns `{"ok": true}`. Configuration comes from environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LASTFM_API_KEY` | unset | Last.fm API key. Without it `music` is `null`. |
| `LASTFM_USER` | `SpotifyNutzeer` | Last.fm user whose tracks are shown. |
| `PROMETHEUS_URL` | `http://monitoring-kube-prometheus-prometheus.monitoring:9090` | Prometheus base URL for the server load. |
| `WEATHER_LAT`, `WEATHER_LON` | coordinates of Bierwang | Location for the weather. |
| `PROJECT_URLS` | `{"linkhop": "https://linkhop.paul.wtf", "tidalwave": "https://tidalwave.paul.wtf"}` | JSON object of project name and the URL to check. `{}` turns the check off. |

Container:

```bash
podman build -t homepage-api:dev api
podman run --rm -p 8080:8080 homepage-api:dev
```

## Release

Tagged releases push to GHCR via GitHub Actions:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The same tag builds two images: `ghcr.io/paul-wtf/homepage:v0.1.0` for the site and `ghcr.io/paul-wtf/homepage-api:v0.1.0` for the API. Update the image tags in `k8s/deployment.yaml` and `k8s/api-deployment.yaml` (and the FluxCD-managed manifests) in the release commit, then tag that commit. A new GHCR package starts private; make it public after the first push so the cluster can pull it.

## Deploy

Apply manifests in `k8s/` to the cluster. The API reads `LASTFM_API_KEY` from the secret `homepage-api-credentials`; the reference is optional, so a missing secret only leaves `music` empty. In production these are reconciled by FluxCD from `paulwtf-infra/fluxcd` (`apps/homepage/`), not applied by hand.
