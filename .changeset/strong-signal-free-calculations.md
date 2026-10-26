---
'octane': patch
---

Stop Strong mode from pulling the signal-binding runtime into apps that never use signals. A second cached render calculation was named like a `$` signal handle, so its text or attribute went through signal bindings and enabled them for the whole module. Strong mode also no longer caches object and array literals on host attributes: a static `style={{ … }}` stays in the template, as it does without Strong mode. Component props and `ref` arrays keep their stable identities.
