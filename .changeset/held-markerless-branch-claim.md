---
'octane': patch
---

Keep every root of a hydrating `@if` or `@switch` arm that suspends inside a deferred `<Hydrate>` boundary while the server rendered no range for it. When the arm's last root was static, after the component that suspended or after a `use()` in the arm itself, the boundary's retry still bounded the arm after its first roots. Hydration looked right, but switching to another case left the arm's later roots on screen, and a case change while the boundary was pending did the same. The arm now ends after every root its template adopted, both when it first suspends and when the boundary retries it.
