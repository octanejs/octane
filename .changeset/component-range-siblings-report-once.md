---
'octane': patch
---

When hydration finds other server content in a range where the client renders
several siblings, such as server text in a `{hole}` whose client value is a
component that renders two components, the development console now logs one
hydration mismatch diagnostic for that recovery instead of one per sibling.
Once a recovery reaches the end of the range, by discarding the server content
before it or by rebuilding a single-root clone over the last server node,
later sibling components, fragment clones, and single-root clones that find
that end build on the client without a second "the server rendered the end of
the parent block" diagnostic. A mismatch in a separate range still reports on
its own.
