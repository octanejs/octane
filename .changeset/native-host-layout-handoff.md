---
'octane': patch
---

Allow a compiler-proven native host to transfer its class and known-provider style bindings to normal hydration while its opaque children retain their own rendering and control ownership. Keep the early layout active during suspension or refusal, preserve the current presentation during accepted transfer, and validate the host and its source before publishing the successor.

Keep the early scalar adapter's handoff symbol in the existing control registry so accessing the capability does not make cold renderer and event-lease helpers an eager dependency.

Retry skipped native effects through the existing native-read scheduler when their surviving render has already completed, without weakening stale-publication checks or reviving disposed owners. Preserve suspended-island ownership and held-transition priority.
