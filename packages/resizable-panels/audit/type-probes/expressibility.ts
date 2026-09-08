import type {
	Dispatch,
	ProposedProps,
	PublicComponentResult,
	PublicNode,
	PublicRef,
	PublicStyle,
	SetStateAction,
} from './proposed-public-types.js';

const nodeAccepted: PublicNode = 'panel';
// OctaneNode is intentionally opaque (`unknown`), so object-backed renderables
// remain representable without importing ReactNode's closed union.
const opaqueNodeAccepted: PublicNode = { panel: true };

const refAccepted: PublicRef<HTMLDivElement> = { current: null };

const styleAccepted: PublicStyle = { display: 'flex' };
// @ts-expect-error CSS display does not accept arbitrary objects
const styleRejected: PublicStyle = { display: { flex: true } };

const dispatchAccepted: Dispatch<SetStateAction<number>> = (_action) => {};
dispatchAccepted(1);
dispatchAccepted((previous) => previous + 1);
// @ts-expect-error dispatch rejects unrelated values
dispatchAccepted('1');

const propsAccepted: ProposedProps = {
	'aria-label': 'panels',
	children: nodeAccepted,
	elementRef: refAccepted,
	onPointerDown: (event) => event.preventDefault(),
	style: styleAccepted,
};
// @ts-expect-error invalid intrinsic attributes remain rejected
const propsRejected: ProposedProps = { definitelyNotADivAttribute: true };
const eventAccepted = (event: PointerEvent) => event.pointerId;
// @ts-expect-error native PointerEvent has no React synthetic nativeEvent wrapper
const eventRejected = (event: PointerEvent) => event.nativeEvent;
const resultAccepted: PublicComponentResult = propsAccepted.children;

void [
	opaqueNodeAccepted,
	styleRejected,
	propsRejected,
	eventAccepted,
	eventRejected,
	resultAccepted,
];
