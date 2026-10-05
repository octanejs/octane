---
'octane': patch
---

Stop shipping the Fragment ref implementation in applications that use `<Activity>` without `<Fragment ref>`. Revealing an Activity now recognises its Fragment refs by their live registration instead of an `instanceof` check, so the `FragmentInstance` class is bundled only when a Fragment ref exists.
