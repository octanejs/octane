---
'@octanejs/cli': patch
'create-octane': patch
---

Scaffold a landing page instead of a placeholder, and give `fullstack` the
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

Styling is scoped `<style>` inside each component, with a reset and light/dark
theme tokens in `index.html`. No stylesheet, no CSS framework, nothing to
uninstall.

`tsconfig.json` now includes `octane.config.ts`, so a route entry naming an
export that does not exist fails `typecheck` rather than at request time.
