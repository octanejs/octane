import {
	attachBehaviorRoot,
	type BehaviorCleanup,
	type BehaviorContext,
	type BehaviorEntry,
	type BehaviorRegistration,
	type BehaviorRoot,
	type ExternalRange,
} from 'octane';
import { attachBehaviorRoot as attachFocusedBehaviorRoot } from 'octane/behavior';

const container = document.createElement('main');
const owner = Symbol('external stream');
const lifetime = new AbortController();

const root: BehaviorRoot = attachBehaviorRoot(container, { signal: lifetime.signal });
const focusedRoot: BehaviorRoot = attachFocusedBehaviorRoot(container, { replace: true });
const range: ExternalRange = focusedRoot.registerExternalRange(container, {
	owner,
	ready: Promise.resolve(),
});

const entry: BehaviorEntry = {
	id: 'annotations',
	target: '[data-annotation]',
	owner,
	events: ['click'],
	ready: Promise.resolve(),
	dependencies: [],
	conflicts: [],
	adopt(element, context: BehaviorContext) {
		const signal: AbortSignal = context.signal;
		const adopted: Element = element;
		adopted.addEventListener('click', () => {}, { signal });
		const cleanup: BehaviorCleanup = () => adopted.removeAttribute('data-adopted');
		return cleanup;
	},
	handleEvent(event, element, context) {
		const original: Event = event;
		const adopted: Element = element;
		const signal: AbortSignal = context.signal;
		if (!signal.aborted && original.type === 'click') adopted.matches('[data-annotation]');
	},
};

const registration: BehaviorRegistration = focusedRoot.registerBehavior(entry);
const rangeReady: Promise<void> = range.ready;
const behaviorReady: Promise<void> = registration.ready;
const rootReady: Promise<void> = focusedRoot.ready;

registration.dispose();
range.dispose();
root.dispose({ preserveDOM: true });

// @ts-expect-error — a behavior root adopts an element, not an arbitrary node.
attachBehaviorRoot(document.createTextNode('not a container'));

// @ts-expect-error — every externally owned range declares its owner.
focusedRoot.registerExternalRange(container, {});

// @ts-expect-error — behavior targets must be a selector or an element.
focusedRoot.registerBehavior({ target: 123, adopt() {} });

// @ts-expect-error — adoption cleanup cannot return an arbitrary value.
focusedRoot.registerBehavior({ target: 'button', adopt: () => 123 });
