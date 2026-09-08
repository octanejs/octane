import type { OctaneNode } from 'octane';

import type { OTPInputProps, RenderProps, SlotProps } from '../src/types';

declare function expectType<T>(value: T): void;
declare const child: OctaneNode;

const controlled: OTPInputProps = {
	maxLength: 6,
	value: '123',
	onChange(value) {
		expectType<string>(value);
	},
	children: child,
	'aria-label': 'Verification code',
	autoComplete: 'one-time-code',
	inputMode: 'numeric',
	name: 'otp',
	disabled: false,
};

const uncontrolled: OTPInputProps = {
	maxLength: 6,
	defaultValue: '12',
	render(props) {
		expectType<RenderProps>(props);
		expectType<SlotProps[]>(props.slots);
		return props.slots.map((slot) => slot.char);
	},
	onFocus(event) {
		expectType<HTMLInputElement>(event.currentTarget);
	},
	onBlur(event) {
		expectType<HTMLInputElement>(event.currentTarget);
	},
	onPaste(event) {
		expectType<HTMLInputElement>(event.currentTarget);
	},
	onMouseOver(event) {
		expectType<HTMLInputElement>(event.currentTarget);
	},
	onMouseLeave(event) {
		expectType<HTMLInputElement>(event.currentTarget);
	},
	ref: { current: null },
};

const callbackRef: OTPInputProps = {
	maxLength: 4,
	children: child,
	ref(input) {
		expectType<HTMLInputElement | null>(input);
	},
	pushPasswordManagerStrategy: 'increase-width',
	pasteTransformer: (pasted) => pasted.replaceAll('-', ''),
	textAlign: 'center',
	noScriptCSSFallback: null,
	nonce: 'style-nonce',
};

expectType<OTPInputProps>(controlled);
expectType<OTPInputProps>(uncontrolled);
expectType<OTPInputProps>(callbackRef);

// @ts-expect-error maxLength is required
const missingMaxLength: OTPInputProps = { children: child };

// @ts-expect-error render and children are mutually exclusive
const renderAndChildren: OTPInputProps = { maxLength: 6, render: () => child, children: child };

// @ts-expect-error one of render or children is required
const missingProjection: OTPInputProps = { maxLength: 6 };

const nativeChangeLeak: OTPInputProps = {
	maxLength: 6,
	children: child,
	// @ts-expect-error the public callback receives a string, not the native input event
	onChange: (event: Event) => event,
};

const invalidStrategy: OTPInputProps = {
	maxLength: 6,
	children: child,
	// @ts-expect-error invalid password-manager strategies are rejected
	pushPasswordManagerStrategy: 'overlay',
};

const unknownIntrinsicProp: OTPInputProps = {
	maxLength: 6,
	children: child,
	// @ts-expect-error intrinsic input props remain strict
	imaginaryInputProp: true,
};

void [
	missingMaxLength,
	renderAndChildren,
	missingProjection,
	nativeChangeLeak,
	invalidStrategy,
	unknownIntrinsicProp,
];
