---
'octane': patch
---

Avoid scheduling a capture fallback task for ordinary delegated discrete events when no controlled form restoration is pending. Preserve the fallback for a controlled edit whose native bubble is stopped below the root, including controls armed after capture and restores queued by nested events.
