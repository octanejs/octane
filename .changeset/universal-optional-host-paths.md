---
'octane': minor
---

Universal renderers now ship host-binding and template-program code only when they use it. A Three scene's production bundle is about 5.2 KB gzip smaller.

- `universalHostBinding()` installs the subscription, flush, and binding-only transaction code on its first call, so roots in an app that never creates a binding no longer carry it. Binding behavior is unchanged.
- Template programs are now opt-in per driver. A driver's `templateProgramMount`, `templateProgramRuns`, and `collapsedTemplateMount` capabilities take effect only when the driver also sets `templates: universalHostTemplates`, a new export from `octane/universal` and `octane/universal/native`. A driver that declares these capabilities without it mounts and updates those trees through ordinary host commands. The Lynx background driver passes it.
