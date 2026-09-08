import type { OctaneNode } from 'octane';

import type { OTPInputProps, RenderProps } from '../src/types';

// This prop fixture covers the unchanged input-otp-facing surface used by the
// canonical shadcn wrapper: intrinsic input props and refs pass through while
// both context-child and render-prop projection remain available.
declare const slots: OctaneNode;

const contextChildProps = {
	maxLength: 6,
	children: slots,
	ref: { current: null as HTMLInputElement | null },
	value: '123',
	onChange: (_value: string) => undefined,
	onFocus: (_event: unknown) => undefined,
	onBlur: (_event: unknown) => undefined,
	onPaste: (_event: unknown) => undefined,
	onMouseOver: (_event: unknown) => undefined,
	onMouseLeave: (_event: unknown) => undefined,
	className: 'sr-only',
	containerClassName: 'flex items-center',
	nonce: 'style-nonce',
	'aria-label': 'One-time password',
} satisfies OTPInputProps;

const renderProps = {
	maxLength: 6,
	render: (_state: RenderProps) => slots,
} satisfies OTPInputProps;

void [contextChildProps, renderProps];
