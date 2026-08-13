---
'@octanejs/lynx': patch
---

Negotiate collapsed template-run teardown with the universal renderer.

The Lynx binding now accepts one `destroy-run` command for an eligible removed
program-run range, expands it through the certified teardown path, and replies
with one compact `remove-run` acknowledgement. Reused ids, partial ranges,
rollbacks, explicit paths, refs, portals, and host callbacks retain their
existing guarded paths.
