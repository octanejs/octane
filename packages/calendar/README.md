# @octanejs/calendar

An Octane port of
[`react-calendar@6.0.1`](https://github.com/wojtekmaj/react-calendar/tree/dc73f86f68239cb694650b66e0795a2f7f9323ed/packages/react-calendar).

## Installation

```sh
npm install @octanejs/calendar
pnpm add @octanejs/calendar
```

```tsrx
import { useState } from 'octane';
import Calendar from '@octanejs/calendar';
import '@octanejs/calendar/Calendar.css';

export function DatePicker() @{
  const [value, setValue] = useState<Date | null>(new Date());

  <Calendar onChange={(nextValue) => setValue(nextValue as Date | null)} value={value} />
}
```

The public component callback remains named `onChange`. Calendar tiles are
buttons, so callbacks receive the browser's native `MouseEvent`; native events
do not need React's `event.persist()`.

## Refs

`Calendar` keeps upstream's two distinct ref surfaces:

- `ref` is an ordinary Octane component prop populated by
  `useImperativeHandle`. It exposes `activeStartDate`, `value`, `view`,
  `drillDown`, `drillUp`, `onChange`, and `setActiveStartDate`.
- `inputRef` receives the main calendar `HTMLDivElement`.

Octane does not use `forwardRef`; pass either ref directly as its named prop.

## Compatibility

The root exports `Calendar` (default and named), `CenturyView`, `DecadeView`,
`MonthView`, `YearView`, `Navigation`, and the upstream root types. The preferred
stylesheet path is `@octanejs/calendar/Calendar.css`; the upstream
`dist/Calendar.css` path is also available.

Pin details, test disposition, and known differences are recorded in
[`UPSTREAM.md`](./UPSTREAM.md).
