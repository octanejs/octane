---
'@octanejs/lynx': patch
---

Apply complete pristine dense-run teardown without materializing per-host commands.

The Lynx host now certifies an exact sole `destroy-run` directly against its
untouched dense store, removes only its accepted roots, and releases native
event registrations structurally after every removal succeeds. Partial,
reordered, mutated, non-uniform, reused, faulted, portal, list, ref, and explicit
paths retain the existing expanded validation and terminal-cleanup behavior.
