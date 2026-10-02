---
'octane': patch
---

When hydration finds other server content in a range where the client renders
several sibling component calls, such as server text in a `{hole}` whose client
value is a component that renders two components, the development console now
logs one hydration mismatch diagnostic for that recovery instead of one per
sibling. The first sibling reports what the server rendered and discards it up
to the end of the range; later siblings, fragment clones, and single-root
clones that then find that end build on the client without a second
"the server rendered the end of the parent block" diagnostic. A mismatch in a
separate range still reports on its own.
