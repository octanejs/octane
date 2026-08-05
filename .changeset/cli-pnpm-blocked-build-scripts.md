---
'@octanejs/cli': patch
---

Finish the install when pnpm blocks a dependency build script.

pnpm refuses to run a dependency's install script until the project records a
decision about it, and since 11.0 it says so by failing the command, after the
packages are already on disk. `octane init` and `octane create` read any
non-zero exit as a dead install and stopped there, which left the dependencies
installed and the dev dependencies missing: the generated app had no bundler,
and `pnpm dev` died on `Cannot find package 'vite'`. Scaffolding a `fullstack`
app with pnpm 11 hit this every time, since `esbuild` reaches that tree and
carries an install script.

Installs driven by the scaffold now name the build scripts the generated app
needs, passing `--allow-build=esbuild` to pnpm: that install script is how
vite's platform binary arrives. Only that package is approved, so a build script
arriving through some other dependency stays the user's decision. pnpm older
than 10.4 does not take the flag and the install is retried without it, and
`--allow-build` is never passed to npm, yarn, or bun, which would read it as a
package name.

A blocked build script the CLI did not name no longer aborts the run either. The
packages installed, so setup continues and the pending decision is reported
under `Do this by hand` as a `pnpm approve-builds` step.
