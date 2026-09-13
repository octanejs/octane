/** @jsxImportSource octane */
import { createRoot, delegateEvents, hydrateRoot } from 'octane';
import type { ErrorBoundary } from '@octanejs/react-error-boundary';
import { BoundaryFixture, type FixtureProps } from './fixture';
delegateEvents(['click']);
const container = document.querySelector<HTMLElement>('#root')!;
const output = document.querySelector<HTMLOutputElement>('#observations')!;
const before = container.querySelector('#survivor');
let epoch = 0;
let resetKey = 0;
let boundary: ErrorBoundary | null = null;
let firstHandle: ErrorBoundary | null = null;
const observations: {
	resets: unknown[];
	errors: unknown[];
	refAttached: boolean;
	sameHandle: boolean;
} = {
	resets: [],
	errors: [],
	refAttached: false,
	sameHandle: true,
};
const report = () => {
	output.value = JSON.stringify(observations);
};
const boundaryRef = (value: ErrorBoundary | null) => {
	boundary = value;
	if (value && !firstHandle) firstHandle = value;
	observations.refAttached = value !== null;
	if (value) observations.sameHandle = value === firstHandle;
	report();
};
function props(): FixtureProps {
	const renderEpoch = epoch;
	return {
		epoch,
		resetKey,
		boundaryRef,
		onReset: (details) => {
			observations.resets.push({ epoch: renderEpoch, details });
			report();
		},
		onError: (error) => {
			observations.errors.push(error);
			report();
		},
	};
}
const hydrating = container.childNodes.length > 0;
const root = hydrating ? hydrateRoot(container, BoundaryFixture, props()) : createRoot(container);
if (!hydrating) root.render(BoundaryFixture, props());
container.dataset.adopted = String(
	before !== null && before === container.querySelector('#survivor'),
);
document
	.querySelector('#reset')!
	.addEventListener('click', () => boundary?.resetErrorBoundary('retry', epoch));
document.querySelector('#rerender')!.addEventListener('click', () => {
	epoch++;
	root.render(BoundaryFixture, props());
});
document.querySelector('#keys')!.addEventListener('click', () => {
	resetKey++;
	root.render(BoundaryFixture, props());
});
document.querySelector('#unmount')!.addEventListener('click', () => {
	root.unmount();
	report();
});
report();
container.dataset.ready = 'true';
