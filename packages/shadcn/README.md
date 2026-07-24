# @octanejs/shadcn

shadcn/ui for the [octane](https://github.com/octanejs/octane) renderer — a port
of the **Radix base** of [shadcn-ui/ui](https://github.com/shadcn-ui/ui) onto
octane's hooks and native events, built on
[`@octanejs/radix`](../radix).

Upstream pin: `shadcn-ui/ui@4baadbc6` + CLI `shadcn@4.14.1`. The cva variant
maps, class strings, and `data-slot`/`data-variant` attributes are preserved
byte-for-byte from the pinned sources — upstream style CSS and consumer
selectors keep working unchanged.

```tsx
import { Badge, cn } from '@octanejs/shadcn';
import '@octanejs/shadcn/theme.css';
```

Status: Phase 0 (scaffold + first proof component). Scope, tiers, and the
registry distribution plan live in
[docs/shadcn-port-plan.md](../../docs/shadcn-port-plan.md); the current
supported surface is tracked in [status.json](./status.json) and the generated
[bindings status table](../../docs/bindings-status.md).
