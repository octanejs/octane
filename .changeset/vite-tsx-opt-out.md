---
'octane': patch
---

`octane/compiler/vite` accepts `tsx: false` to leave `.tsx` files to another
JSX transform (React) and octane-compile only `.tsrx`. This is the setup for
mixed-renderer apps: incremental adoption of Octane inside a React app via
`@octanejs/react-wrapper`, and React-authored islands inside an Octane app via
`@octanejs/react-compat`.
