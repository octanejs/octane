---
published: 2026-06-02
authors:
  - Manuel Schiller
title: 'TanStack Start Adds First-Class Rsbuild Support'
excerpt: 'TanStack Start now supports Rsbuild 2 alongside Vite, so teams can choose the build tool that best fits their stack, preferences, and infrastructure.'
library: start
---

![React Server Components](/blog-assets/start-adds-rsbuild-support/header.jpg)

TanStack Start now supports Rsbuild 2 alongside Vite, giving teams two supported build-tool paths for Start.

Some teams prefer Vite. Some prefer Rsbuild because it is built on Rspack, feels familiar to teams with Webpack experience, or matches how the rest of their frontend infrastructure is organized. The new adapter makes that choice explicit: Start fits into either build tool through its plugin system.

We built the adapter together with the Rsbuild and Rspack team, and some of that work fed back into Rsbuild and Rspack along the way.

For a React app, the config looks like this:

```ts title='rsbuild.config.ts'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [pluginReact(), tanstackStart()],
})
```

React and Solid are supported today, and because the Rsbuild work lives at Start's shared build layer, future framework adapters have the same path available to them.

Rsbuild owns the build, while the framework plugin handles React or Solid and `tanstackStart()` wires Start into both the client and server builds. If you have used Start with Vite, the pattern is intentionally familiar because the Start build-tool plugins are designed to fit naturally into the toolchain you choose.

## A Start path for teams using Rsbuild

Some teams want to use Start with Rsbuild because they want Rspack under the hood, a Webpack-familiar model, or a build tool that matches the rest of their stack.

That also matters for existing apps. A team moving to Start can keep more of its build setup in place instead of changing framework and build tool at once. One large company is already using the adapter while moving several apps from a Webpack setup to Start on Rsbuild.

That path includes the full Start feature set, including React and Solid apps, Server Functions, SSR and streaming SSR, HMR, import protection, and React Server Components for React apps.

## The two-adapter rule

There is a pattern we keep running into at TanStack: the first adapter proves something can work, and the second adapter shows which parts actually belong in the core.

TanStack Router and TanStack Start already went through this once at the UI framework layer, where adding Solid made the React assumptions easier to see and improved the shared core. Adding Rsbuild brought the same clarity to the build layer.

Because the first Start build adapter was Vite, some build logic naturally grew around Vite's plugin lifecycle, and adding Rsbuild made the boundary sharper: shared Start build behavior in one place, build-tool-specific behavior in the Vite and Rsbuild adapters.

## Your build tool, your choice

Choosing Start should let a team keep its preferred build tool. With Vite and Rsbuild both supported, teams can use the toolchain that fits their stack while building the same kind of Start app.

Teams that prefer Rsbuild, or already work in the Webpack and Rspack world, now get a native Start integration through Rsbuild's plugin system.

The Rsbuild adapter is available now. Try it in a new Rsbuild project or in an existing codebase moving to Start.
