# @octanejs/input-otp

An accessible one-time password input for the [Octane](https://github.com/octanejs/octane)
renderer, ported from [`input-otp@1.5.0`](https://github.com/guilhermerodz/input-otp).
It keeps one native input for keyboard, screen-reader, paste, and mobile autofill
behavior while projecting the value into individually styled slots.

## Installation

```sh
npm install @octanejs/input-otp
pnpm add @octanejs/input-otp
```

```tsx
import { useContext, useState } from 'octane';
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from '@octanejs/input-otp';

function Slots(_props: {}) @{
	const state = useContext(OTPInputContext);
	const indexes = state.slots.map((_slot, index) => index);

	<div class="otp-slots">
		@for (const index of indexes; key index) {
			<span data-active={state.slots[index].isActive || undefined}>
				{state.slots[index].char ?? state.slots[index].placeholderChar ?? '–'}
			</span>
		}
	</div>
}

export function VerificationCode(_props: {}) @{
	const [value, setValue] = useState('');

	<OTPInput
		maxLength={6}
		value={value}
		onChange={setValue}
		pattern={REGEXP_ONLY_DIGITS}
		aria-label="Verification code"
	>
		<Slots />
	</OTPInput>
}
```

The root package exports `OTPInput`, `OTPInputContext`, the three built-in regexp
patterns, and the `OTPInputProps`, `RenderProps`, and `SlotProps` types. Prop names,
callback payloads, intrinsic input attributes, context/render projection, selection,
paste transformation, completion, overflow-aware password-manager displacement, the
`nonce` style-tag prop, default `spellCheck={false}`, container `translate="no"`,
SSR, and hydration match the pinned 1.5.0 contract. Octane's native `input` event
drives edits internally; the public callback remains `onChange(newValue)`.

See [UPSTREAM.md](./UPSTREAM.md) for provenance and test inventory details. Current
verification status is generated from [status.json](./status.json) into the repository's
[bindings status](../../docs/bindings-status.md).

## License

MIT — derived from input-otp, © Guilherme Rodrigues and contributors.
