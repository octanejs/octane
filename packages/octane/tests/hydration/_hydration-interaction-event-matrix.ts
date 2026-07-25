import type { HydrationInteractionEvent } from 'octane/hydration';

export type HydrationInteractionEventFamily = 'focus' | 'keyboard' | 'mouse' | 'pointer';

export type HydrationInteractionEventCase = {
	type: HydrationInteractionEvent;
	family: HydrationInteractionEventFamily;
	bubbles: boolean;
	cancelable: boolean;
	composed: boolean;
	sequence: number;
};

export const HYDRATION_INTERACTION_EVENT_CASES = [
	{
		type: 'auxclick',
		family: 'mouse',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 1,
	},
	{
		type: 'click',
		family: 'mouse',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 2,
	},
	{
		type: 'contextmenu',
		family: 'mouse',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 3,
	},
	{
		type: 'dblclick',
		family: 'mouse',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 4,
	},
	{
		type: 'focusin',
		family: 'focus',
		bubbles: true,
		cancelable: false,
		composed: true,
		sequence: 5,
	},
	{
		type: 'keydown',
		family: 'keyboard',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 6,
	},
	{
		type: 'keyup',
		family: 'keyboard',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 7,
	},
	{
		type: 'mousedown',
		family: 'mouse',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 8,
	},
	{
		type: 'mouseenter',
		family: 'mouse',
		bubbles: false,
		cancelable: false,
		composed: false,
		sequence: 9,
	},
	{
		type: 'mouseover',
		family: 'mouse',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 10,
	},
	{
		type: 'mouseup',
		family: 'mouse',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 11,
	},
	{
		type: 'pointerdown',
		family: 'pointer',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 12,
	},
	{
		type: 'pointerenter',
		family: 'pointer',
		bubbles: false,
		cancelable: false,
		composed: false,
		sequence: 13,
	},
	{
		type: 'pointerover',
		family: 'pointer',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 14,
	},
	{
		type: 'pointerup',
		family: 'pointer',
		bubbles: true,
		cancelable: true,
		composed: true,
		sequence: 15,
	},
] as const satisfies ReadonlyArray<HydrationInteractionEventCase>;

type AssertNever<T extends never> = T;

// Adding a public interaction event must add public replay evidence in the same
// change. The reverse direction is checked by `satisfies` above.
export type AllHydrationInteractionEventsCovered = AssertNever<
	Exclude<HydrationInteractionEvent, (typeof HYDRATION_INTERACTION_EVENT_CASES)[number]['type']>
>;

export const HYDRATION_INTERACTION_EVENT_TYPES = HYDRATION_INTERACTION_EVENT_CASES.map(
	(testCase) => testCase.type,
);

export const HYDRATION_INTERACTION_CROSS_REALM_CASES = HYDRATION_INTERACTION_EVENT_CASES.filter(
	(testCase) =>
		testCase.type === 'focusin' ||
		testCase.type === 'keydown' ||
		testCase.type === 'mousedown' ||
		testCase.type === 'pointerdown',
);

type EventWindow = Window & typeof globalThis;

function mouseEventInit(
	relatedTarget: EventTarget,
	testCase: HydrationInteractionEventCase,
): MouseEventInit {
	const sequence = testCase.sequence;
	const button = testCase.type === 'auxclick' ? 1 : testCase.type === 'contextmenu' ? 2 : 0;
	return {
		bubbles: testCase.bubbles,
		cancelable: testCase.cancelable,
		composed: testCase.composed,
		detail: sequence,
		screenX: 100 + sequence,
		screenY: 200 + sequence,
		clientX: 300 + sequence,
		clientY: 400 + sequence,
		ctrlKey: sequence % 2 === 0,
		shiftKey: sequence % 3 === 0,
		altKey: sequence % 4 === 0,
		metaKey: sequence % 5 === 0,
		button,
		buttons: 1 << button,
		relatedTarget,
	};
}

export function createHydrationInteractionEvent(
	ownerWindow: EventWindow,
	relatedTarget: EventTarget,
	testCase: HydrationInteractionEventCase,
): Event {
	const base = {
		bubbles: testCase.bubbles,
		cancelable: testCase.cancelable,
		composed: testCase.composed,
	};
	const sequence = testCase.sequence;
	switch (testCase.family) {
		case 'focus':
			return new ownerWindow.FocusEvent(testCase.type, {
				...base,
				detail: sequence,
				relatedTarget,
			});
		case 'keyboard':
			return new ownerWindow.KeyboardEvent(testCase.type, {
				...base,
				detail: sequence,
				key: `key-${sequence}`,
				code: `Code${sequence}`,
				location: sequence % 4,
				repeat: sequence % 2 === 0,
				isComposing: sequence % 3 === 0,
				ctrlKey: sequence % 2 === 0,
				shiftKey: sequence % 3 === 0,
				altKey: sequence % 4 === 0,
				metaKey: sequence % 5 === 0,
			});
		case 'mouse':
			return new ownerWindow.MouseEvent(testCase.type, mouseEventInit(relatedTarget, testCase));
		case 'pointer':
			return new ownerWindow.PointerEvent(testCase.type, {
				...mouseEventInit(relatedTarget, testCase),
				pointerId: 500 + sequence,
				width: 20 + sequence,
				height: 30 + sequence,
				pressure: 0.5,
				tangentialPressure: 0.25,
				tiltX: sequence,
				tiltY: -sequence,
				twist: 40 + sequence,
				pointerType: 'pen',
				isPrimary: sequence % 2 === 0,
			});
	}
}

export type HydrationReplayRecord = {
	phase: 'parent' | 'target';
	type: string;
	constructorName: string;
	targetId: string | null;
	currentTargetId: string | null;
	targetIsOriginal: boolean;
	bubbles: boolean;
	cancelable: boolean;
	composed: boolean;
	defaultPreventedBefore: boolean;
	defaultPreventedAfter: boolean;
	detail: number | null;
	relatedTargetId: string | null;
	screenX: number | null;
	screenY: number | null;
	clientX: number | null;
	clientY: number | null;
	ctrlKey: boolean | null;
	shiftKey: boolean | null;
	altKey: boolean | null;
	metaKey: boolean | null;
	button: number | null;
	buttons: number | null;
	key: string | null;
	code: string | null;
	location: number | null;
	repeat: boolean | null;
	isComposing: boolean | null;
	pointerId: number | null;
	width: number | null;
	height: number | null;
	pressure: number | null;
	tangentialPressure: number | null;
	tiltX: number | null;
	tiltY: number | null;
	twist: number | null;
	pointerType: string | null;
	isPrimary: boolean | null;
};

function numberProperty(event: Event, name: string): number | null {
	const value = (event as unknown as Record<string, unknown>)[name];
	return typeof value === 'number' ? value : null;
}

function booleanProperty(event: Event, name: string): boolean | null {
	const value = (event as unknown as Record<string, unknown>)[name];
	return typeof value === 'boolean' ? value : null;
}

function stringProperty(event: Event, name: string): string | null {
	const value = (event as unknown as Record<string, unknown>)[name];
	return typeof value === 'string' ? value : null;
}

function elementId(value: unknown): string | null {
	return value !== null &&
		typeof value === 'object' &&
		'nodeType' in value &&
		(value as Node).nodeType === 1
		? (value as Element).id
		: null;
}

function hydrationReplayRecord(
	phase: 'parent' | 'target',
	originalTarget: Element,
	event: Event,
): HydrationReplayRecord {
	const defaultPreventedBefore = event.defaultPrevented;
	if (phase === 'target' && event.type === 'click') event.preventDefault();
	return {
		phase,
		type: event.type,
		constructorName: event.constructor.name,
		targetId: elementId(event.target),
		currentTargetId: elementId(event.currentTarget),
		targetIsOriginal: event.target === originalTarget,
		bubbles: event.bubbles,
		cancelable: event.cancelable,
		composed: event.composed,
		defaultPreventedBefore,
		defaultPreventedAfter: event.defaultPrevented,
		detail: numberProperty(event, 'detail'),
		relatedTargetId: elementId((event as unknown as Record<string, unknown>).relatedTarget ?? null),
		screenX: numberProperty(event, 'screenX'),
		screenY: numberProperty(event, 'screenY'),
		clientX: numberProperty(event, 'clientX'),
		clientY: numberProperty(event, 'clientY'),
		ctrlKey: booleanProperty(event, 'ctrlKey'),
		shiftKey: booleanProperty(event, 'shiftKey'),
		altKey: booleanProperty(event, 'altKey'),
		metaKey: booleanProperty(event, 'metaKey'),
		button: numberProperty(event, 'button'),
		buttons: numberProperty(event, 'buttons'),
		key: stringProperty(event, 'key'),
		code: stringProperty(event, 'code'),
		location: numberProperty(event, 'location'),
		repeat: booleanProperty(event, 'repeat'),
		isComposing: booleanProperty(event, 'isComposing'),
		pointerId: numberProperty(event, 'pointerId'),
		width: numberProperty(event, 'width'),
		height: numberProperty(event, 'height'),
		pressure: numberProperty(event, 'pressure'),
		tangentialPressure: numberProperty(event, 'tangentialPressure'),
		tiltX: numberProperty(event, 'tiltX'),
		tiltY: numberProperty(event, 'tiltY'),
		twist: numberProperty(event, 'twist'),
		pointerType: stringProperty(event, 'pointerType'),
		isPrimary: booleanProperty(event, 'isPrimary'),
	};
}

export function observeHydrationReplays(
	parent: Element,
	target: Element,
): { records: HydrationReplayRecord[]; cleanup: () => void } {
	const records: HydrationReplayRecord[] = [];
	const listeners: Array<{
		element: Element;
		type: HydrationInteractionEvent;
		listener: EventListener;
	}> = [];
	const listen = (
		element: Element,
		phase: 'parent' | 'target',
		type: HydrationInteractionEvent,
	) => {
		const listener: EventListener = (event) => {
			records.push(hydrationReplayRecord(phase, target, event));
		};
		element.addEventListener(type, listener);
		listeners.push({ element, type, listener });
	};
	for (const testCase of HYDRATION_INTERACTION_EVENT_CASES) {
		listen(target, 'target', testCase.type);
		listen(parent, 'parent', testCase.type);
	}
	return {
		records,
		cleanup() {
			for (const { element, type, listener } of listeners) {
				element.removeEventListener(type, listener);
			}
		},
	};
}

export function expectedHydrationReplayMetadata(
	testCase: HydrationInteractionEventCase,
): Partial<HydrationReplayRecord> {
	const sequence = testCase.sequence;
	const button = testCase.type === 'auxclick' ? 1 : testCase.type === 'contextmenu' ? 2 : 0;
	const modifiers = {
		ctrlKey: sequence % 2 === 0,
		shiftKey: sequence % 3 === 0,
		altKey: sequence % 4 === 0,
		metaKey: sequence % 5 === 0,
	};
	switch (testCase.family) {
		case 'focus':
			return {
				constructorName: 'FocusEvent',
				detail: sequence,
				relatedTargetId: 'hydration-replay-related',
			};
		case 'keyboard':
			return {
				constructorName: 'KeyboardEvent',
				detail: sequence,
				key: `key-${sequence}`,
				code: `Code${sequence}`,
				location: sequence % 4,
				repeat: sequence % 2 === 0,
				isComposing: sequence % 3 === 0,
				...modifiers,
			};
		case 'mouse':
			return {
				constructorName: 'MouseEvent',
				detail: sequence,
				screenX: 100 + sequence,
				screenY: 200 + sequence,
				clientX: 300 + sequence,
				clientY: 400 + sequence,
				button,
				buttons: 1 << button,
				relatedTargetId: 'hydration-replay-related',
				...modifiers,
			};
		case 'pointer':
			return {
				constructorName: 'PointerEvent',
				detail: sequence,
				screenX: 100 + sequence,
				screenY: 200 + sequence,
				clientX: 300 + sequence,
				clientY: 400 + sequence,
				button,
				buttons: 1 << button,
				relatedTargetId: 'hydration-replay-related',
				pointerId: 500 + sequence,
				width: 20 + sequence,
				height: 30 + sequence,
				pressure: 0.5,
				tangentialPressure: 0.25,
				tiltX: sequence,
				tiltY: -sequence,
				twist: 40 + sequence,
				pointerType: 'pen',
				isPrimary: sequence % 2 === 0,
				...modifiers,
			};
	}
}
