---
'octane': patch
---

Universal signal bindings in template programs: a signal handle in a prepared program's slot no longer forces its row out of the program. The program carries the handle's current value, rows still mount as one `mount-template-run`, and the binding attaches to the row's host record and slot, so a write sends one `update` for the bound program node. Retained rows rebind their slots when they are patched in place, and a program expanded into ordinary hosts hands its slot bindings to them. Signal bindings and native reads are installed by `enableUniversalNativeReads`, which only modules with a runtime signals import call, so renderers without signals do not ship them. Bound sources and their bindings are prototype objects instead of per-handle closures, and a flush reads each notified source once and skips the other bindings of a notified row.
