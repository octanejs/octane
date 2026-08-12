import { PointerLockControls, type PointerLockControlsProps } from '../src/index.js';

const props: PointerLockControlsProps = {
	selector: '.enter-game',
	enabled: true,
	makeDefault: true,
	onLock: (event) => event?.type,
};
PointerLockControls;
props;

// @ts-expect-error selector is a CSS selector string
const invalid: PointerLockControlsProps = { selector: 42 };
