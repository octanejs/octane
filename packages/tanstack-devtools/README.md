# @octanejs/tanstack-devtools

[TanStack Devtools](https://tanstack.com/devtools) bindings for
[Octane](https://github.com/octanejs/octane).

This is an Octane port of `@tanstack/react-devtools`. It reuses the
framework-agnostic `@tanstack/devtools` core **unchanged** and ports the thin
adapter layer — the `TanStackDevtools` component — so Octane elements can be used
as plugin panels, titles, and custom triggers.

## Installation

```bash
pnpm add @octanejs/tanstack-devtools
```

## Usage

```tsx
import { TanStackDevtools } from '@octanejs/tanstack-devtools';

function App() @{
  <>
    <TanStackDevtools
      plugins={[
        {
          id: 'my-plugin',
          name: 'My Plugin',
          render: () => <MyPluginPanel />,
        },
      ]}
    />
    <MyApp />
  </>
}
```

`plugins`, `config`, and `eventBusConfig` mirror `@tanstack/react-devtools`.
`config.customTrigger` accepts an Octane element (or a function returning one) for
a custom launcher.

## Notes / divergences

- Public adapter types are Octane-prefixed: `TanStackDevtoolsOctanePlugin` and
  `TanStackDevtoolsOctaneInit`.
- `ref` is the normal React-19-style ref prop and events are native — there is no
  synthetic event layer.
- The main entry also re-exports the `@tanstack/devtools` core surface
  (`TanStackDevtoolsCore`, `PLUGIN_CONTAINER_ID`, `PLUGIN_TITLE_CONTAINER_ID`, and
  the plugin authoring types) so you don't need a direct dependency on
  `@tanstack/devtools` to type plugins.

Only include the devtools in development, e.g. behind a `import.meta.env.DEV`
check or via `lazy()`.
