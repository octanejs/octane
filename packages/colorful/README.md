# @octanejs/colorful

Exact Octane binding for [`react-colorful@5.8.0`](https://github.com/omgovich/react-colorful).

## Install

```sh
npm install @octanejs/colorful
pnpm add @octanejs/colorful
```

## Use

```tsrx
import { useState } from 'octane';
import { HexColorPicker } from '@octanejs/colorful';

export function Picker() @{
  const [color, setColor] = useState('#aabbcc');
  <HexColorPicker color={color} onChange={setColor} />
}
```

The package exports all 14 upstream picker variants, `HexColorInput`, the six
public color-model types, and `setNonce`. Pickers inject the upstream stylesheet
once into their closest `Document` or `ShadowRoot`, including iframe documents.

`HexColorInput` retains the upstream public `onChange(color)` callback. Its
internal text host uses Octane's native `input` event, so consumers do not need
to rename the component callback.

See [UPSTREAM.md](./UPSTREAM.md) for the pinned release and adaptation record.
