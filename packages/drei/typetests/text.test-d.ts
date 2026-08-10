import type { TextProps } from '@octanejs/drei';

const props: TextProps = {
	children: 'hello',
	fontSize: 2,
	anchorX: 'center',
	direction: 'rtl',
	color: 'hotpink',
};
void props;

// @ts-expect-error text direction is restricted to supported Troika values
const invalidDirection: TextProps = { children: 'hello', direction: 'sideways' };
void invalidDirection;
