<div align="center">

# TanStack.com

The home of the TanStack ecosystem. Built with [TanStack Router](https://tanstack.com/router) and deployed on [Cloudflare Workers](https://workers.cloudflare.com/).

<a href="https://twitter.com/tan_stack"><img src="https://img.shields.io/twitter/follow/tan_stack.svg?style=social" alt="Follow @TanStack"/></a>

### [Become a Sponsor!](https://github.com/sponsors/tannerlinsley/)

</div>

## Development

### Quick Start

From your terminal:

```sh
pnpm install
pnpm dev
```

This starts your app in development mode, rebuilding assets on file changes.

### Local Setup

The documentation for all TanStack projects (except `React Charts`) is hosted on [tanstack.com](https://tanstack.com). In production, doc pages are fetched from GitHub. In development, they're read from your local file system.

Create a `tanstack` parent directory and clone this repo alongside the projects:

```sh
mkdir tanstack && cd tanstack
git clone git@github.com:TanStack/tanstack.com.git
git clone git@github.com:TanStack/query.git
git clone git@github.com:TanStack/router.git
git clone git@github.com:TanStack/table.git
```

Your directory structure should look like this:

```
tanstack/
   ├── tanstack.com/
   ├── query/
   ├── router/
   └── table/
```

> [!WARNING]
> Directory names must match repo names exactly (e.g., `query` not `tanstack-query`). The app finds docs by looking for sibling directories by name.

### Editing Docs

To edit docs for a project, make changes in its `docs/` folder (e.g., `../form/docs/`) and visit http://localhost:3000/form/latest/docs/overview to preview.

> [!NOTE]
> Updated pages need to be manually reloaded in the browser.

> [!WARNING]
> Update the project's `docs/config.json` if you add a new doc page!

## Get Involved

- We welcome issues and pull requests!
- Participate in [GitHub Discussions](https://github.com/TanStack/tanstack.com/discussions)
- Chat with the community on [Discord](https://discord.com/invite/WrRKjPJ)

## Explore the TanStack Ecosystem

- <a href="https://github.com/tanstack/config"><b>TanStack Config</b></a> – Tooling for JS/TS packages
- <a href="https://github.com/tanstack/db"><b>TanStack DB</b></a> – Reactive sync client store
- <a href="https://github.com/tanstack/devtools"><b>TanStack DevTools</b></a> – Unified devtools panel
- <a href="https://github.com/tanstack/form"><b>TanStack Form</b></a> – Type‑safe form state
- <a href="https://github.com/tanstack/pacer"><b>TanStack Pacer</b></a> – Debouncing, throttling, batching
- <a href="https://github.com/tanstack/query"><b>TanStack Query</b></a> – Async state & caching
- <a href="https://github.com/tanstack/ranger"><b>TanStack Ranger</b></a> – Range & slider primitives
- <a href="https://github.com/tanstack/router"><b>TanStack Router</b></a> – Type‑safe routing, caching & URL state
- <a href="https://github.com/tanstack/router"><b>TanStack Start</b></a> – Full‑stack SSR & streaming
- <a href="https://github.com/tanstack/store"><b>TanStack Store</b></a> – Reactive data store
- <a href="https://github.com/tanstack/table"><b>TanStack Table</b></a> – Headless datagrids
- <a href="https://github.com/tanstack/virtual"><b>TanStack Virtual</b></a> – Virtualized rendering

… and more at <a href="https://tanstack.com"><b>TanStack.com »</b></a>

<!-- Use the force, Luke -->
