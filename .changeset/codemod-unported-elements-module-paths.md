---
'@octanejs/codemod': patch
---

A component from a React package with no Octane port that cannot render in a `ReactCompat` island now fails where it renders with the error the codemod reported, naming the component and the package. The codemod used to leave the element as it was, so Octane failed on the React component deep in its renderer with `Element type is invalid … object with keys {$$typeof, render}`. The element is now wrapped in a local `NoOctanePort` component that throws that error. Swap the wrapper for `ReactCompat` once nothing Octane renders reaches the component.

String literals that are exactly the path of a module renamed to `.tsrx` are now updated in configs, scripts, and other modules that keep their names, such as Vite's `server.warmup.clientFiles: ['./src/main.tsx']`. A path resolves from its own file or from the project root. Before, Vite logged `Failed to load url /src/main.tsx` on every start.
