import {
	attachBehaviorRoot,
	type BehaviorCleanup,
	type BehaviorContext,
	type BehaviorEntry,
	type BehaviorRegistration,
	type BehaviorRoot,
	type ExternalRange,
} from 'octane';
import {
	adoptBindings,
	mountBindings,
	attachBehaviorRoot as attachFocusedBehaviorRoot,
	type BindingHandle,
	type BindingOptions,
	type BindingSource,
	type BindingRange,
	type BindingMountTarget,
} from 'octane/behavior';

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

declare function PrimaryAction(props: { type: 'button' | 'submit'; disabled: boolean }): unknown;
const presentation: BindingSource<{ type: 'button' | 'submit'; disabled: boolean }> = {
	getSnapshot: () => ({ type: 'submit', disabled: false }),
	subscribe: () => () => {},
};
const bindingOptions: BindingOptions = { signal: lifetime.signal, restoreStyles: true };
const binding: BindingHandle = adoptBindings(
	container,
	PrimaryAction,
	presentation,
	bindingOptions,
);
binding.refresh();
binding.dispose();

const first = document.createComment('first');
const last = document.createComment('last');
const presentationRange: BindingRange = { start: first, end: last };
const mountTarget: BindingMountTarget = { parent: container, before: last };
const mounted: BindingHandle = mountBindings(
	mountTarget,
	PrimaryAction,
	presentation,
	bindingOptions,
);
adoptBindings(presentationRange, PrimaryAction, presentation, bindingOptions);
mounted.dispose({ preserveDOM: false });

adoptBindings(container, PrimaryAction, {
	// @ts-expect-error — the source cannot widen the component's required prop types.
	getSnapshot: () => ({ type: 1, disabled: false }),
	subscribe: () => () => {},
});
adoptBindings(container, PrimaryAction, {
	// @ts-expect-error — the source must supply every required component prop.
	getSnapshot: () => ({ type: 'submit' as const }),
	subscribe: () => () => {},
});
adoptBindings(container, PrimaryAction, {
	getSnapshot: presentation.getSnapshot,
	// @ts-expect-error — an owned subscription must supply cleanup.
	subscribe: () => {},
});
// @ts-expect-error — adoption takes an exact element, not a selector or a text node.
adoptBindings('#primary-action', PrimaryAction, presentation);
