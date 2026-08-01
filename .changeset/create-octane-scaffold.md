---
'create-octane': patch
'@octanejs/cli': patch
---

Add `create-octane`, and give `octane init` the files an app needs to actually run.

`npm create octane my-app` now scaffolds a project from an empty directory.
There are two templates, matching the two shapes `octane init` already knew:
`spa` for a client-only app, and `fullstack` for routing, server rendering, and
a production build.

Leave an argument off and you are asked for it, so `npm create octane` on its
own walks through a project name, offered as `octane-app`, and a template. A
flag always wins over a question, and with nothing to answer on, a missing
argument is a usage error rather than a prompt nobody can see.

On a terminal, `init` still lists what it will write and install and asks to
confirm, the same as running it yourself. Declining leaves nothing behind:
`create-octane` removes the directory and the manifest it had created and says
so, rather than reporting a project that was never written. With nobody there to
answer, `--yes` is passed instead, decided by asking the CLI whether it can
prompt rather than by guessing.

Two CLI fixes came out of that. `--yes` now means "stop asking" on a terminal
too: it was consulted only once the CLI had decided nobody was watching, so
typing it in a real shell did nothing. And `resolveMode` is exported, so a
caller driving `main` can get the CLI's own answer to whether it will prompt
instead of keeping a second copy of the rule.

Both templates are deliberately bare: one component, no styling, and the
smallest config that runs. A scaffolded project also passes its own
`prettier --check` from the first commit, which meant generating the files in
Prettier's own default style rather than the repository's.

`init` now writes a `.prettierrc` registering `@tsrx/prettier-plugin`, and
installs it along with `prettier`, because Prettier cannot parse `.tsrx` without
it. A project that already has a Prettier config keeps it, and is told which
plugin to add, the same rule already applied to a bundler config.


The package creates the directory and its `package.json`, then hands the
directory to `octane init`. The templates stay in the CLI rather than being
copied here, so the two commands cannot drift into scaffolding different
projects.

`octane init` itself wrote no HTML shell and no client entry, in either mode.
That left `--mode spa` with a wired-up bundler, no entry component, and nothing
for `vite` to open, while `--mode fullstack` produced a project whose production
build failed outright, because `@octanejs/vite-plugin` requires an `index.html`
once `octane.config.ts` declares routes. Both modes now get an `index.html`, spa
also gets a `src/main.ts` that mounts `App` into `#root`, and the entry
component is written for spa as well as fullstack.

The fullstack shell carries the `<!--ssr-head-->` and `<!--ssr-body-->` markers
the server renderer requires, and no entry script, since the plugin injects
hydration itself. When a project already has an `index.html` without those
markers, init names the ones to add rather than editing the file, which is the
same rule it already followed for an existing bundler config.
