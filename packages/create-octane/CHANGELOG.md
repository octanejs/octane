# create-octane

## 0.0.9

### Patch Changes

- Updated dependencies [8adc693]
  - @octanejs/cli@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [b3537b4]
  - @octanejs/cli@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies [d275405]
  - @octanejs/cli@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [e814506]
  - @octanejs/cli@0.0.6

## 0.0.5

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - @octanejs/cli@0.0.5

## 0.0.4

### Patch Changes

- 522c083: Scaffold a landing page instead of a placeholder, and give `fullstack` the
  routes that justify its name.

  `octane create` and `octane init` previously wrote an `App.tsrx` reading "Hello
  from Octane", and `fullstack` differed from `spa` only by an `octane.config.ts`
  carrying a single route — so the template that exists to demonstrate routing,
  SSR and hydration demonstrated none of them, and the first thing a new project
  showed was a placeholder to delete.

  Both templates now open on a landing page: the Octane mark, and cards linking
  into the documentation. `fullstack` additionally scaffolds `/counter`, which
  arrives server-rendered and becomes interactive on hydration, a `Layout.tsrx`
  the two pages share, and a `GET /api/health` `ServerRoute` — a handler returning
  a `Response` rather than a component, which is the half of the app layer `spa`
  has no equivalent for.

  The palette, typography and card styling are octanejs.dev's own, so a scaffolded
  app and the documentation look like one thing. `src/styles.css` carries the
  tokens and both colour schemes and the shell links it; each component keeps its
  own scoped `<style>`. No CSS framework, nothing to uninstall.

  The stylesheet is linked from the shell rather than imported by a component,
  because a CSS import is injected by JavaScript in dev and the tokens would
  arrive after the server-rendered markup that reads them. When `init` runs
  against a project that kept its own `index.html`, it writes the stylesheet and
  states the `<link>` to add, the same way it already states the SSR markers.

  `tsconfig.json` now includes `octane.config.ts`, so a route entry naming an
  export that does not exist fails `typecheck` rather than at request time.

  `octane init --mode fullstack` no longer writes an entry component into a
  project that brought its own `octane.config.ts`. The pages belong to the routes
  this command declares; that config names its own entries, which may not be these
  files at all, so writing them produced components nothing routed to. A missing
  entry in someone's own config stays `octane doctor`'s to report.

- Updated dependencies [522c083]
  - @octanejs/cli@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [8c72c58]
  - @octanejs/cli@0.0.3

## 0.0.2

### Patch Changes

- 5ec8998: Add `octane create` and `create-octane`, and give `octane init` the files an app
  needs to actually run.

  `npm create octane my-app` now scaffolds a project from an empty directory.
  There are two templates, matching the two shapes `octane init` already knew:
  `spa` for a client-only app, and `fullstack` for routing, server rendering, and
  a production build.

  The scaffold is `octane create`, a command in the CLI. The published
  `create-octane` is only the entry point: `npm create octane` arrives with the
  project name as the first argument, so its bin puts `create` in front of argv
  and hands over. Everything else, including the two templates and the files
  themselves, is shared with `octane init`, which does the same work against a
  project that already exists.

  Leave an argument off and you are asked for it, so `npm create octane` on its
  own walks through a project name, offered as `octane-app`, and a template. A
  flag always wins over a question, and with nothing to answer on, a missing
  argument is a usage error rather than a prompt nobody can see.

  On a terminal it still lists what it will write and install and asks to confirm,
  the same as running `octane init` yourself. Declining leaves nothing behind: the
  directory and the manifest it had created are removed and it says so, rather
  than reporting a project that was never written.

  Installing goes through the manager that ran the command, read from
  `npm_config_user_agent`, so `pnpm create octane` installs with pnpm rather than
  answering a pnpm user with a `package-lock.json`. The next steps it prints name
  that manager too, and quote the directory, since a name with a space in it is
  accepted and `cd My App!` is not a command anyone can paste. After
  `--no-install` they point at the package list `init` printed, rather than at an
  `install` that would resolve a manifest with nothing in it yet. For this `init`
  gains `--package-manager <name>`, which also covers running it by hand in a
  project that has no lockfile to detect yet.

  One other CLI fix came out of that. `--yes` now means "stop asking" on a
  terminal too, for every kind of question rather than only the confirm: it was
  consulted once the CLI had decided nobody was watching, so typing it in a real
  shell did nothing, and `octane create --yes` then blocked on the very questions
  the flag was meant to answer. A question with no default has nothing to answer
  with, so it is still asked.

  The package entry exports what it did before. `resolveMode` and
  `PACKAGE_MANAGERS` were briefly added for a caller that drove `main` from
  another package, and that caller no longer exists.

  `ctx.ui` gains `text`, the free-text prompt the project name needs. An empty
  submission means the offered default, so accepting it by pressing enter and
  typing it out land in the same place.

  Both templates are deliberately bare: one component, no styling, and the
  smallest config that runs. A scaffolded project also passes its own
  `prettier --check` from the first commit, which meant generating the files in
  Prettier's own default style rather than the repository's.

  `init` now writes a `.prettierrc` registering `@tsrx/prettier-plugin`, and
  installs it along with `prettier`, because Prettier cannot parse `.tsrx` without
  it. A project that already has a Prettier config keeps it, and is told which
  plugin to add, the same rule already applied to a bundler config. Which config
  gets read follows Prettier's own search order, so the `prettier` field of
  package.json wins over a config file when a project has both. A field holding a
  path is followed to the file it names, and one naming a shareable config is
  reported as settings this command cannot read.

  `init` also installs `typescript`, at the range `@tsrx/typescript-plugin`
  declares as its peer, read from the plugin once it is on disk rather than
  chosen here. It is a required peer of the plugin that ships `tsrx-tsc`, and
  nothing in the toolchain carries a compiler of its own, so npm and pnpm install
  it themselves but yarn does not: `yarn create octane` used to produce a project
  whose `typecheck` script died on `Cannot find module 'typescript'`. Naming the
  package with no range is not the fix either, since that takes the newest major,
  which `tsrx-tsc` cannot start under. With `--no-install` the range cannot be
  read yet, so the package is named in the list to install by hand instead.

  A directory has to be empty, except that a fresh `.git` is allowed,
  since `mkdir app && cd app && git init` is a common way to start and holds no
  work to protect. A name that lands on an existing file is reported as one,
  rather than read as a directory and thrown as `ENOTDIR`.

  `octane init` itself wrote no HTML shell and no client entry, in either mode.
  That left `--mode spa` with a wired-up bundler, no entry component, and nothing
  for `vite` to open, while `--mode fullstack` produced a project whose production
  build failed outright, because `@octanejs/vite-plugin` requires an `index.html`
  once `octane.config.ts` declares routes. Both modes now get an `index.html`, spa
  also gets a `src/main.ts` that mounts `App` into `#root`, and the entry
  component is written for spa as well as fullstack. Every one of those files is
  written only when it is absent, and spa adds the component only alongside the
  entry that imports it, so a project keeping its own `src/main.ts` does not
  collect one nothing references.

  The fullstack shell carries the `<!--ssr-head-->` and `<!--ssr-body-->` markers
  the server renderer requires, and no entry script, since the plugin injects
  hydration itself. When a project already has an `index.html` without those
  markers, init names the ones to add rather than editing the file, which is the
  same rule it already followed for an existing bundler config.

- Updated dependencies [5ec8998]
  - @octanejs/cli@0.0.2
