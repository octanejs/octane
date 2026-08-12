import type { CausticsProps } from '@octanejs/drei';

const props: CausticsProps = {
	causticsOnly: true,
	backside: false,
	lightSource: [5, 5, 5],
	resolution: 64,
};
void props;

// @ts-expect-error lightSource is a three-axis tuple or object ref
const invalid: CausticsProps = { causticsOnly: false, backside: true, lightSource: [1, 2] };
void invalid;
