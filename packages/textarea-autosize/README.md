# @octanejs/textarea-autosize

Octane binding for `react-textarea-autosize@8.5.9`.

## Installation

```sh
npm install @octanejs/textarea-autosize
pnpm add @octanejs/textarea-autosize
```

```tsrx
import TextareaAutosize from '@octanejs/textarea-autosize';

export function Notes() @{
  <TextareaAutosize minRows={2} maxRows={8} />
}
```

The binding preserves the default component and named `TextareaAutosizeProps` and
`TextareaHeightChangeMeta` types from `react-textarea-autosize@8.5.9`. Native
textarea attributes, `minRows`, `maxRows`, `cacheMeasurements`, refs, form reset,
font loading, window resizing, SSR, and `onHeightChange` are supported.

The public `onChange` callback runs for user edits after uncontrolled sizing, as it
does upstream. Octane passes the native `InputEvent` rather than a React
`SyntheticEvent`; use `event.currentTarget.value` during dispatch. Assigning the
DOM `value` property programmatically does not synthesize either framework's
change callback—dispatch an input event when testing that path.

`style.minHeight` and `style.maxHeight` are rejected in development. Use
`minRows` and `maxRows` instead.
