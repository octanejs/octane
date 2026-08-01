# create-octane

Create an Octane app in a new directory.

```bash
npm create octane my-app
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

`spa` is a client-only app: the compiler plugin, an `index.html`, and an entry
that mounts one component.

`fullstack` adds `octane.config.ts` with one route, streaming SSR, hydration,
and a production build.

Both are deliberately bare. There is no styling and nothing to delete before you
start.

## What it does

It creates the directory and a `package.json`, then hands the directory to
[`octane init`](../cli), which writes the TypeScript settings `.tsrx` needs, the
bundler config, the scripts, and the entry files. Both commands scaffold the
same project, because they run the same code.

Dependencies are installed through your package manager, which is also what
records them in `package.json`. Pass `--no-install` to skip that, and the list
to install by hand is printed instead.

## Editor support

An Octane project builds, typechecks, and runs from the scaffold alone. Making
an editor understand `.tsrx` is separate: the extension is not published yet, so
until it is, a `.tsrx` import may show as unresolved even though `npm run
typecheck` passes. `tsrx-tsc` carries its own TypeScript and is the reliable
answer on whether the project is type-correct.
