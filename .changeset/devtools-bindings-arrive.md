---
'@octanejs/tanstack-devtools': patch
---

Add the Octane binding for TanStack Devtools (`@tanstack/react-devtools` 0.10.7),
porting the `TanStackDevtools` component and its plugin/init types while reusing
the framework-agnostic `@tanstack/devtools` core unchanged. Plugin, title, and
custom-trigger content authored as Octane elements is portaled into the containers
the core creates. Public adapter types are Octane-prefixed
(`TanStackDevtoolsOctanePlugin`, `TanStackDevtoolsOctaneInit`), `ref` is the normal
React-19-style ref prop, and events are native. The main entry also re-exports the
`@tanstack/devtools` core surface so consumers can type plugins without a direct
dependency on it. Includes behavioral, SSR, and type tests.
