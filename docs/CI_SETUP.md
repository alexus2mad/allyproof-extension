# CI/CD one-time setup

This repo runs two GitHub Actions workflows:

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | push to `main`, PRs to `main` | typecheck + build (Chrome + Firefox) + manifest validation |
| `.github/workflows/release.yml` | tag push matching `v*` | builds all three release ZIPs and creates a **draft** GitHub Release with them attached |

Both workflows depend on `@allyproof/scan-core`, which lives in the
**private** sibling repo `alexus2mad/allyproof` (at
`services/scan-core/`). The extension's `package.json` references it via
a `file:../accessiscan/services/scan-core` dep — the workflows mirror
that local layout by sparse-checking-out the main repo into a sibling
path inside the runner.

That cross-repo checkout requires a Personal Access Token. **The token
must be created once and stored as a GitHub Actions secret**; both
workflows then reference it as `secrets.MAIN_APP_REPO_TOKEN`.

---

## One-time PAT setup

1. Go to https://github.com/settings/personal-access-tokens (use a
   **fine-grained** PAT, not a classic one).
2. Click **Generate new token → Fine-grained personal access token**.
3. Configure:
   - **Token name**: `allyproof-extension-ci`
   - **Expiration**: 90 days (rotate; or set "no expiration" if you accept
     the long-term-credential risk)
   - **Resource owner**: `alexus2mad`
   - **Repository access**: **Only select repositories** →
     `alexus2mad/allyproof` (just the main app, not this extension repo
     and not the other repos)
   - **Repository permissions**:
     - **Contents**: **Read-only** ← this is the only permission needed
     - leave everything else as "No access"
4. Click **Generate token** and copy the value. You will not see it again.
5. In **this repo's** settings:
   https://github.com/alexus2mad/allyproof-extension/settings/secrets/actions
6. Click **New repository secret**.
   - Name: `MAIN_APP_REPO_TOKEN`
   - Value: paste the token from step 4.
7. Save.

Push any commit to `main` or open a PR — the CI workflow should now
succeed.

---

## Cutting a release

Releases are tag-driven. To ship a new version (e.g. v1.0.1):

```bash
# 1. Bump package.json + lockfile
npm version 1.0.1 --no-git-tag-version
# (this updates package.json + package-lock.json but does not tag yet)

# 2. Update store/changelog.md — add a section starting with "## v1.0.1"

# 3. Commit
git add package.json package-lock.json store/changelog.md
git commit -m "release: v1.0.1"
git push origin main

# 4. Tag + push
git tag v1.0.1
git push origin v1.0.1
```

Step 4 triggers `release.yml`, which:

1. Verifies the tag matches `package.json` version (catches mismatches).
2. Builds `release/allyproof-chrome-v1.0.1.zip`,
   `allyproof-firefox-v1.0.1.zip`, and `allyproof-source-v1.0.1.zip`.
3. Creates a **draft** GitHub Release named `v1.0.1` with:
   - Release notes pulled from the matching `## v1.0.1` section of
     `store/changelog.md`
   - Upload instructions for each store
   - All three ZIPs attached as assets

Review the draft release in the GitHub UI, edit the notes if needed,
then click **Publish release**. Download the three ZIPs from the
release and upload each to its respective store dashboard.

See `docs/processes/chrome-extension-publishing.md` in the main app repo
for the per-store upload checklist.

---

## What the workflows do NOT do (and why)

- **No auto-publish to Chrome Web Store / Edge / Firefox.** Each store
  requires the privacy practices form, screenshots, and per-release
  notes to be reviewed by a human. Auto-publish would also require
  storing each store's OAuth refresh token as a long-lived secret —
  large blast radius if leaked. Cutting a manual upload step from the
  release flow is not worth that risk surface.
- **No lint.** The repo's `eslint .` script currently exits 0 without
  checking anything (ESLint 9 requires a flat config file —
  `eslint.config.js` — which isn't present yet). Adding a lint job
  to CI would lie about coverage. **TODO:** wire ESLint 9 flat config
  and add a `lint` job to `ci.yml`.
- **No tests.** Vitest is installed but no `*.test.ts` / `*.spec.ts`
  files exist in `src/`. Add tests, then add a `test` job to CI.
- **No automated dep audit.** `npm audit` is left to local runs for
  now. Once we have a stable schedule, add a weekly Dependabot config.

---

## Long-term: simplify by publishing scan-core to npm

The `@allyproof/scan-core` `file:` dep is the only reason CI needs a
cross-repo checkout and a PAT. Publishing `@allyproof/scan-core` to
the public npm registry would let this repo install it as a normal
versioned dep:

```diff
- "@allyproof/scan-core": "file:../accessiscan/services/scan-core"
+ "@allyproof/scan-core": "^0.1.0"
```

After that change:
- `ci.yml` and `release.yml` drop the second `actions/checkout` step
- The `MAIN_APP_REPO_TOKEN` secret can be revoked
- Local dev becomes `npm install` with no sibling-repo dependency
- The main app's `services/scan-core/` would publish to npm via its
  own workflow (separate concern)

Tracked separately. Until then, the PAT-based dual-checkout pattern
above is the path.
