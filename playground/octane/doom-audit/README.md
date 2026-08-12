# Doom clean-room compatibility evidence

The application uses `doom-react-three-fiber` only as an external behavioral oracle, pinned to commit `b48daeb3f91b8d8175a1d59d6a9c0c6c3b47caa0`. That repository has no declared license, so Octane does not vendor, package, fetch in CI, or copy its source and assets.

An isolated oracle-research context recorded only user-observable behavior, numeric transitions, counts, timings, and framework categories. A separate clean-room implementation context receives `audit.json`, not the upstream checkout. The shipped visuals and audio are independently authored procedural data under this repository's MIT license.

Run `node scripts/doom-audit.mjs` and `node --test scripts/doom-audit.test.mjs` to validate completeness, role separation, construct classification, evidence links, and redistribution metadata. Browser and unit evidence targets must be exact `it(...)` titles from `playground/octane/tests/doom/doom-production.test.ts` and `playground/octane/src/demos/doom/model.test.ts`.

