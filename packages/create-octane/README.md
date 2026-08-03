# create-octane

Create an Octane app in a new directory.

```bash
npm create octane my-app
cd my-app
npm run dev
```

`pnpm create octane my-app`, `yarn create octane my-app`, and
`npx create-octane my-app` all reach the same place.

## Templates

You are asked which one you want, along with a project name, or you can say it
up front:

```bash
npm create octane my-app -- --template spa
npm create octane my-app -- --template fullstack
```

npm needs that `--` to forward the flag; pnpm and yarn forward it already, so
drop it there.

`spa` is a client-only app: the compiler plugin, an `index.html`, and an entry
that mounts one component.

<!-- scaffold:spa -->

```
index.html
vite.config.ts
tsconfig.json
package.json
.prettierrc
src/
  main.ts        mounts App into #root
  App.tsrx       the landing page
  styles.css     the reset and the theme tokens
```

<!-- /scaffold:spa -->

`fullstack` adds `octane.config.ts` with routing, streaming SSR, hydration, and
a production build, and it uses that surface rather than describing it: a second
page, and an endpoint that returns a `Response` instead of a component.

<!-- scaffold:fullstack -->

```
index.html            carries the <!--ssr-head--> / <!--ssr-body--> markers
octane.config.ts      2 render routes + 1 server route
vite.config.ts
tsconfig.json
package.json
.prettierrc
src/
  App.tsrx            /
  Counter.tsrx        /counter — server-rendered, then hydrated
  Layout.tsrx         the frame both pages share
  styles.css          the reset and the theme tokens
  server/health.ts    GET /api/health
```

<!-- /scaffold:fullstack -->

Both open on a page that links back into the documentation, and both are a
working starting point rather than a directory of things to delete. The palette,
typography and card styling are [octanejs.dev](https://octanejs.dev)'s own, so a
new app and the documentation look like one thing; `src/styles.css` holds the
tokens and both colour schemes, and each component carries its own scoped
`<style>`. There is no CSS framework to uninstall.

## What it does

It runs [`octane create`](https://octanejs.dev/docs/cli#create), which makes the
directory and its `package.json` and then writes the TypeScript settings `.tsrx`
needs, the bundler config, the scripts, and the entry files. That last part is
the same code `octane init` runs against a project you already have, so the two
cannot scaffold different projects.

This package is only the entry point. Everything above lives in
[`@octanejs/cli`](https://octanejs.dev/docs/cli), so `npm create octane my-app`
and `octane create my-app` are the same command reached two ways.

Dependencies are installed through your package manager, which is also what
records them in `package.json`. Pass `--no-install` to skip that, and the list
to install by hand is printed instead.

## Editor support

An Octane project builds, typechecks, and runs from the scaffold alone. Making
an editor understand `.tsrx` is separate: the extension is not published yet, so
until it is, a `.tsrx` import may show as unresolved even though `npm run
typecheck` passes. `tsrx-tsc` carries its own TypeScript and is the reliable
answer on whether the project is type-correct.
