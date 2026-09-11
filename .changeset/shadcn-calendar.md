---
'@octanejs/shadcn': patch
'@octanejs/lucide': patch
---

Add the shadcn Calendar family to the Base UI and Radix bases, wrapping `@octanejs/day-picker`. The two sources match upstream's own `base` and `radix` calendars, which are the same file over `react-day-picker`: the same props, selection modes, dropdown caption, week numbers, range markers, and `data-slot="calendar"` contract, with Nova's three `.cn-calendar*` rules resolved into the component's class strings and its icon placeholders resolved to Lucide. The four `components` overrides are module-level, so selecting a day updates the existing day buttons instead of remounting the grid. Widen the Lucide `style` prop type to accept an octane `CSSProperties` object, which a component forwarding its own `style` to an icon needs; the runtime already spread the value unchanged.
