---
"octane": patch
---

Keep shared watched sources connected when React replaces sibling retained signal providers in one commit. Outgoing retained subscriptions release after incoming readers attach in the same passive pass.
