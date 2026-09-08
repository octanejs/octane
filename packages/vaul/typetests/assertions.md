# Vaul type assertion groups

Paired repo-authored probes (upstream ships no type suite at `v1.1.2`).

| Group | Pristine (`typetests/pristine`) | Adapted (`tests/types/public-api.ts`) |
| --- | --- | --- |
| valid-content-trigger | accepts `ContentProps.forceMount: true` and `Drawer.Trigger` button props | same against `@octanejs/vaul` |
| invalid-force-mount | rejects `forceMount: false` | same |
| invalid-trigger-prop | rejects arbitrary props on `Drawer.Trigger` | same |
