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

The palette, typography and card styling are octanejs.dev's own, so a scaffolded
app and the documentation look like one thing. `src/styles.css` carries the
tokens and both colour schemes and the shell links it; each component keeps its
own scoped `<style>`. No CSS framework, nothing to uninstall.

The stylesheet is linked from the shell rather than imported by a component,
because a CSS import is injected by JavaScript in dev and the tokens would
arrive after the server-rendered markup that reads them. When `init` runs
against a project that kept its own `index.html`, it writes the stylesheet and
states the `<link>` to add, the same way it already states the SSR markers.

`tsconfig.json` now includes `octane.config.ts`, so a route entry naming an
export that does not exist fails `typecheck` rather than at request time.

`octane init --mode fullstack` no longer writes an entry component into a
project that brought its own `octane.config.ts`. The pages belong to the routes
this command declares; that config names its own entries, which may not be these
files at all, so writing them produced components nothing routed to. A missing
entry in someone's own config stays `octane doctor`'s to report.
