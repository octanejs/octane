---
'octane': patch
---

Production Vite builds no longer hang when components import and render each
other. Before compiling a production client module, the plugin loads each
imported component to check whether it can use a lighter child slot. Inside a
cycle (`A.tsrx` renders `B.tsrx`, which renders `A.tsrx`), each module's
transform waited for the other's, so the build never finished. That happened for
cycles of any length and for separate entry points into one cycle, even when
recursion was bounded at runtime.

The plugin now tracks which proof loads are waiting on which modules, and it
skips a load that would close a cycle. Every import on that cycle keeps ordinary
component dispatch, so a ring of components compiles the same way whichever
member the build reaches first. Imports outside a cycle keep the specialization,
including imports of a component that sits on one, and acyclic graphs compile
exactly as before.
