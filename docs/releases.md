# Releases

Changesets opens the `Version Packages` pull request. Publishing is a separate,
privileged workflow: after any successful `main` CI run, `publish.yml` checks
every publishable workspace version against npm and runs `changeset publish`
only when at least one version is missing.

This is deliberately a reconciliation loop rather than a one-shot tied to the
Version Packages commit. If that commit's CI fails, a later fix on `main` can
publish the stranded versions after it passes the same required checks.
Pending changeset documents are isolated only inside the ephemeral publish
checkout so they cannot switch the publishing action back into version-PR mode;
the Release PR workflow remains their sole owner.

## New package bootstrap

npm trusted publishing can only be configured after a package exists. Before a
new public workspace package can join automated releases, a maintainer must
publish its first version interactively and then authorize this repository's
publish workflow:

```bash
pnpm --filter <package-name> publish --access public --no-git-checks
npm trust github <package-name> \
  --file publish.yml \
  --repo octanejs/octane \
  --allow-publish
```

Run this from a clean, validated `main` checkout with npm 11.15 or newer and an
npm account that owns the package and has two-factor authentication enabled.
The interactive publish is intentionally not automated with a long-lived token.

`pnpm release:preflight` lists every package that needs this bootstrap and exits
before any existing package is published. After bootstrapping, rerun the failed
Publish workflow, or dispatch `publish.yml` with the ID of any successful CI
push run on `main`.

## Recovery

The Publish workflow accepts only successful CI push runs from
`octanejs/octane`, the `main` branch, and `.github/workflows/ci.yml`. It also
requires every protected package, compatibility, typecheck, example, lint, and
test job to have succeeded.

Because npm package versions are immutable, the preflight is safe to repeat:
already-published versions are skipped. It also refuses a stale checkout when a
newer npm version exists, preventing an out-of-order workflow from moving the
`latest` tag backwards.
