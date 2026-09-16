---
'octane': patch
---

Allow explicitly adopted, compiler-proven fixed native views to transfer their early DOM bindings to `hydrateRoot` through `bindingLeases`. Keep early presentation and native commands active while hydration is pending, publish current values before refs, and retire old ownership without replaying already handled commands. Native updates beneath a suspended hydration boundary now retain that boundary's pending capture instead of publishing a child independently.

The early entry remains renderer-free; normal hydration still requires explicitly loading the renderer. Structural regions, dynamic text, writable controls, and unsupported writers are not eligible for this optional handoff.

Retire displaced early bindings only after staged DOM publication, suppress refs from hydration attempts that never commit, and support fixed native views using fresh array/object class values. Hydration-lease errors use the standard production error-code catalog.
