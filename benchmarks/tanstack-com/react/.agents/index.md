# Agent Guidelines

TanStack.com marketing site built with TanStack Start.

## Essentials

- Package manager: `pnpm`
- Run `pnpm test` before commits not after every tiny edit
- Don't run builds or tests after every change. This is a visual site; assume changes work unless reported otherwise.
- Rely on `tsc` or your built-in LSP integration (hopefully you have this)
- **Typesafety is paramount.** Never cast types; fix at source instead. See [typescript.md](./typescript.md).

## Topic Guides

- [TypeScript Conventions](./typescript.md): Type inference, casting rules, generic naming
- [TanStack Patterns](./tanstack-patterns.md): Loaders, server functions, environment shaking
- [UI Style Guide](./ui-style.md): Visual design principles for 2026
- [Workflow](./workflow.md): Build commands, debugging, Playwright
- [Analytics](./analytics.md): GA4 event taxonomy, funnel definition, custom dimensions
