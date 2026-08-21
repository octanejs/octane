---
"octane": patch
---

Fix duplicated text when hydrating a sole primitive child that the server framed,
including spread-bearing hosts and conditional children. Reuse the server Text
node while preserving hydration mismatch suppression, native events, and later
child updates.
