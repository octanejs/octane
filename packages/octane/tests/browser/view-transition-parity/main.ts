import {
	addTransitionType,
	createRoot,
	flushSync,
	startTransition,
	type ViewTransitionInstance,
	type ViewTransitionProps,
} from 'octane';
import { App, type AppProps } from './App.tsrx';

type Kind = 'enter' | 'exit' | 'update' | 'share';
type Status = 'pending' | 'fulfilled' | 'rejected';
interface NativeObservation {
	ready: Status;
	update: Status;
	finished: Status;
}
interface Observation {
	kind: Kind;
	name: string;
	types: string[];
	oldAnimation: string;
	newAnimation: string;
	firstType: string;
	secondType: string;
	defaultClass: string;
	nativeType: string;
	hasComputedStyle: boolean;
	handleAnimation: string | null;
	hasAnimation: boolean;
	animations: string[];
	nested: {
		animations: string[];
		oldOpacity: string;
		oldDisplay: string;
		groupOpacity: string;
		groupDisplay: string;
	} | null;
}

const nativeStart = document.startViewTransition;
if (typeof nativeStart !== 'function') throw new Error('Native View Transitions are required');
const calls: NativeObservation[] = [];
const pending: Promise<void>[] = [];
const events: Observation[] = [];
const cleanups: Kind[] = [];
const refs: Array<string | null> = [];
const insertions: number[] = [];
const passives: Array<{ generation: number; kind: 'mount' | 'cleanup' }> = [];
const layouts: Array<{ generation: number; fontLoaded: boolean }> = [];
const measuredRefs: boolean[] = [];
const outsideGenerations: number[] = [];
const customEvents: string[] = [];
let reentrantUpdate: Update | null = null;
let reentryDescriptor: string | null = null;
class ParityElement extends HTMLElement {
	static observedAttributes = ['data-marker'];
	#marker = '';
	get marker() {
		return this.#marker;
	}
	set marker(value: string) {
		this.#marker = value;
		customEvents.push('property:' + value);
	}
	attributeChangedCallback(_name: string, _old: string | null, value: string | null) {
		customEvents.push('attribute:' + value);
		this.marker = value ?? '';
		if (value === 'prepared' && reentrantUpdate !== null) {
			const update = reentrantUpdate;
			reentrantUpdate = null;
			reentryDescriptor = document.querySelector('#descriptor')?.textContent ?? null;
			render(update, [], true);
		}
	}
	connectedCallback() {
		customEvents.push('connected');
	}
	disconnectedCallback() {
		customEvents.push('disconnected');
	}
}
customElements.define('parity-element', ParityElement);
function controlSnapshot() {
	const select = document.querySelector<HTMLSelectElement>('#selection');
	const textarea = document.querySelector<HTMLTextAreaElement>('#uncontrolled');
	const custom = document.querySelector<ParityElement>('#custom');
	if (!select || !textarea || !custom) return null;
	return {
		selected: select.value,
		options: [...select.options].map((option) => ({
			value: option.value,
			label: option.textContent,
			selected: option.selected,
		})),
		textareaValue: textarea.value,
		textareaDefault: textarea.defaultValue,
		customValue: custom.marker,
		customConnected: custom.isConnected,
		radios: ['#radio-a', '#radio-b'].map(
			(id) => document.querySelector<HTMLInputElement>(id)!.checked,
		),
	};
}
let currentRef: ViewTransitionInstance | null = null;
let outsideClicks = 0;
let finishNavigation: (() => void) | undefined;
let heldUpdate:
	| {
			gate: Promise<void>;
			reached: () => void;
			waiting: Promise<void>;
			release: () => void;
			observer: MutationObserver;
			mutations: string[];
			beforeHTML: string;
			beforeNodes: Node[];
			beforeControlledValue: string;
			beforeControls: ReturnType<typeof controlSnapshot>;
			customEventIndex: number;
	  }
	| undefined;

function withoutTransitionStyle(text: string | null) {
	const style = document.createElement('div').style;
	style.cssText = text ?? '';
	style.removeProperty('view-transition-name');
	style.removeProperty('view-transition-class');
	return style.cssText;
}
function stagedHTML() {
	// An inert owner avoids invoking custom-element callbacks just to observe HTML.
	const clone = document.implementation
		.createHTMLDocument('')
		.importNode(document.querySelector('#root')!, true) as HTMLElement;
	for (const element of clone.querySelectorAll('[style]')) {
		const style = withoutTransitionStyle(element.getAttribute('style'));
		if (style) element.setAttribute('style', style);
		else element.removeAttribute('style');
	}
	return clone.innerHTML;
}
function stagedNodes() {
	const walker = document.createTreeWalker(document.querySelector('#root')!);
	const nodes: Node[] = [];
	while (walker.nextNode()) nodes.push(walker.currentNode);
	return nodes;
}
function recordHeldMutations(records: MutationRecord[]) {
	if (!heldUpdate) return;
	for (const record of records) {
		if (
			record.type === 'attributes' &&
			record.attributeName === 'style' &&
			withoutTransitionStyle(record.oldValue) ===
				withoutTransitionStyle((record.target as Element).getAttribute('style'))
		)
			continue;
		heldUpdate.mutations.push(record.type + ':' + (record.attributeName ?? ''));
	}
}

// Observe native outcomes without replacing capture, callback scheduling or animations.
document.startViewTransition = function (...args) {
	const held = heldUpdate;
	if (held) {
		const options = args[0];
		const update = typeof options === 'function' ? options : options?.update;
		const delayed = async () => {
			held.reached();
			await held.gate;
			await update?.();
		};
		args = [typeof options === 'function' ? delayed : { ...options, update: delayed }];
	}
	const transition = Reflect.apply(nativeStart, document, args) as ViewTransition;
	const call: NativeObservation = { ready: 'pending', update: 'pending', finished: 'pending' };
	calls.push(call);
	pending.push(
		(async () => {
			const outcomes = await Promise.allSettled([
				transition.ready,
				transition.updateCallbackDone,
				transition.finished,
			]);
			call.ready = outcomes[0].status;
			call.update = outcomes[1].status;
			call.finished = outcomes[2].status;
		})(),
	);
	return transition;
};

function record(kind: Kind, instance: ViewTransitionInstance, types: string[]) {
	const oldStyle = getComputedStyle(
		document.documentElement,
		`::view-transition-old(${instance.name})`,
	);
	const newStyle = getComputedStyle(
		document.documentElement,
		`::view-transition-new(${instance.name})`,
	);
	const handle = instance[kind === 'exit' ? 'old' : 'new'];
	const computed = (handle as typeof handle & { getComputedStyle?: () => CSSStyleDeclaration })
		.getComputedStyle;
	const nestedOld = props.nested
		? getComputedStyle(document.documentElement, '::view-transition-old(inner)')
		: null;
	const nestedGroup = props.nested
		? getComputedStyle(document.documentElement, '::view-transition-group(inner)')
		: null;
	events.push({
		kind,
		name: instance.name,
		types: [...types],
		oldAnimation: oldStyle.animationName,
		newAnimation: newStyle.animationName,
		firstType: newStyle.getPropertyValue('--first-type').trim(),
		secondType: newStyle.getPropertyValue('--second-type').trim(),
		defaultClass: newStyle.getPropertyValue('--resolved-default').trim(),
		nativeType: newStyle.getPropertyValue('--native-type').trim(),
		hasComputedStyle: typeof computed === 'function',
		handleAnimation: computed?.call(handle).animationName ?? null,
		hasAnimation: handle.getAnimations().length > 0,
		animations: document.documentElement
			.getAnimations({ subtree: true })
			.map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement ?? ''),
		nested:
			nestedOld && nestedGroup
				? {
						animations: document.documentElement
							.getAnimations({ subtree: true })
							.map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement ?? '')
							.filter((selector) => selector.includes('(inner)')),
						oldOpacity: nestedOld.opacity,
						oldDisplay: nestedOld.display,
						groupOpacity: nestedGroup.opacity,
						groupDisplay: nestedGroup.display,
					}
				: null,
	});
	return () => cleanups.push(kind);
}

const transitionRef = (instance: ViewTransitionInstance | null) => {
	currentRef = instance;
	refs.push(instance?.name ?? null);
};
const handlers = {
	onEnter: (instance: ViewTransitionInstance, types: string[]) => record('enter', instance, types),
	onExit: (instance: ViewTransitionInstance, types: string[]) => record('exit', instance, types),
	onUpdate: (instance: ViewTransitionInstance, types: string[]) =>
		record('update', instance, types),
	onShare: (instance: ViewTransitionInstance, types: string[]) => record('share', instance, types),
	ref: transitionRef,
};
let props: AppProps = {
	visible: true,
	generation: 0,
	text: 'initial',
	title: 'initial',
	styles: {},
	controlledValue: 'initial',
	controls: false,
	options: [],
	selected: 'a',
	textareaDefault: 'initial',
	customValue: 'initial',
	radioA: false,
	radioB: true,
	descriptor: null,
	rows: [],
	measure: false,
	nested: false,
	transition: { name: 'panel', ...handlers },
	onOutsideClick: (generation) => {
		outsideClicks++;
		outsideGenerations.push(generation);
	},
	onInsertion: (generation) => {
		insertions.push(generation);
	},
	onPassive: (generation, kind) => {
		passives.push({ generation, kind });
	},
	onLayout: (generation) => {
		layouts.push({ generation, fontLoaded: document.fonts.check('16px ParityFont') });
	},
	onMeasuredRef: (element) => {
		if (element !== null) measuredRefs.push(document.fonts.check('16px ParityFont'));
	},
};
const root = createRoot(document.querySelector('#root')!);
root.render(App, props);
const initialInput = document.querySelector('#draft');

interface Update {
	visible?: boolean;
	text?: string;
	title?: string;
	styles?: Record<string, string>;
	measure?: boolean;
	nested?: boolean;
	controlledValue?: string;
	controls?: boolean;
	options?: readonly { value: string; label: string }[];
	selected?: string;
	textareaDefault?: string;
	customValue?: string;
	radioA?: boolean;
	radioB?: boolean;
	descriptor?: string | null;
	rows?: readonly { id: string; label: string; editable?: boolean }[];
	// Only JSON data crosses Playwright's page boundary; refs and handlers live here.
	transition?: Pick<
		ViewTransitionProps,
		'name' | 'default' | 'enter' | 'exit' | 'update' | 'share' | 'parentEnter' | 'parentExit'
	>;
}
function render(update: Update, types: string[] = [], urgent = false) {
	const mark = {
		call: calls.length,
		event: events.length,
		cleanup: cleanups.length,
		generation: props.generation + 1,
	};
	props = {
		...props,
		...update,
		generation: mark.generation,
		transition: update.transition ? { ...update.transition, ...handlers } : props.transition,
	};
	const commit = () => {
		for (const type of types) addTransitionType(type);
		root.render(App, props);
	};
	if (urgent) flushSync(commit);
	else startTransition(commit);
	return mark;
}
function snapshot() {
	const panel = document.querySelector('#panel') as HTMLElement | null;
	const input = document.querySelector('#draft') as HTMLInputElement | null;
	return {
		text: panel?.querySelector('span')?.textContent ?? null,
		title: panel?.title ?? null,
		inputIdentity: input === initialInput,
		inputValue: input?.value ?? null,
		name: panel?.style.getPropertyValue('view-transition-name') ?? null,
		className: panel?.style.getPropertyValue('view-transition-class') ?? null,
		outsideClicks,
		outsideGenerations: [...outsideGenerations],
		refName: currentRef?.name ?? null,
		refs: [...refs],
		layouts: [...layouts],
		insertions: [...insertions],
		passives: [...passives],
		controls: controlSnapshot(),
		customEvents: [...customEvents],
		reentryDescriptor,
		measuredRefs: [...measuredRefs],
		cleanups: [...cleanups],
		events: [...events],
	};
}
async function settle(mark: ReturnType<typeof render>) {
	for (let i = mark.call; i < pending.length; i++) await pending[i];
	await Promise.resolve();
	return {
		...snapshot(),
		events: events.slice(mark.event),
		cleanups: cleanups.slice(mark.cleanup),
		calls: calls.slice(mark.call),
	};
}
window.__viewTransitionParity = {
	render,
	settle,
	snapshot,
	reenterOnCustomUpdate(update: Update) {
		reentrantUpdate = update;
	},
	holdNextUpdate() {
		if (heldUpdate) throw new Error('A native update is already held');
		let release!: () => void;
		let reached!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const waiting = new Promise<void>((resolve) => {
			reached = resolve;
		});
		const observer = new MutationObserver(recordHeldMutations);
		heldUpdate = {
			gate,
			release,
			reached,
			waiting,
			observer,
			mutations: [],
			beforeHTML: stagedHTML(),
			beforeNodes: stagedNodes(),
			beforeControlledValue: (document.querySelector('#controlled') as HTMLInputElement).value,
			beforeControls: controlSnapshot(),
			customEventIndex: customEvents.length,
		};
		observer.observe(document.querySelector('#root')!, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeOldValue: true,
			characterData: true,
			characterDataOldValue: true,
		});
	},
	async waitForHeldUpdate() {
		await heldUpdate!.waiting;
	},
	stagingSnapshot() {
		const held = heldUpdate!;
		recordHeldMutations(held.observer.takeRecords());
		const nodes = stagedNodes();
		return {
			beforeHTML: held.beforeHTML,
			currentHTML: stagedHTML(),
			mutations: [...held.mutations],
			sameNodes:
				nodes.length === held.beforeNodes.length &&
				nodes.every((node, index) => node === held.beforeNodes[index]),
			beforeControlledValue: held.beforeControlledValue,
			currentControlledValue: (document.querySelector('#controlled') as HTMLInputElement).value,
			beforeControls: held.beforeControls,
			currentControls: controlSnapshot(),
			customEvents: customEvents.slice(held.customEventIndex),
		};
	},
	releaseHeldUpdate() {
		const held = heldUpdate;
		heldUpdate = undefined;
		held?.observer.disconnect();
		held?.release();
	},
	async beginNavigation() {
		const navigation = (
			window as unknown as {
				navigation: {
					addEventListener(
						type: 'navigate',
						handler: (event: {
							intercept(options: { handler: () => Promise<void> }): void;
						}) => void,
						options: { once: boolean },
					): void;
					navigate(url: string): { committed: Promise<unknown> };
				};
			}
		).navigation;
		const pending = new Promise<void>((resolve) => {
			finishNavigation = resolve;
		});
		navigation.addEventListener(
			'navigate',
			(event) => event.intercept({ handler: () => pending }),
			{ once: true },
		);
		await navigation.navigate('#pending-navigation').committed;
	},
	finishNavigation() {
		finishNavigation?.();
	},
	async unmount() {
		try {
			window.__viewTransitionParity.releaseHeldUpdate();
			finishNavigation?.();
			flushSync(() => root.unmount());
			await Promise.all(pending);
		} finally {
			document.startViewTransition = nativeStart;
		}
	},
};
declare global {
	interface Window {
		__viewTransitionParity: {
			render: typeof render;
			settle: typeof settle;
			snapshot: typeof snapshot;
			reenterOnCustomUpdate(update: Update): void;
			unmount(): Promise<void>;
			beginNavigation(): Promise<void>;
			finishNavigation(): void;
			holdNextUpdate(): void;
			waitForHeldUpdate(): Promise<void>;
			releaseHeldUpdate(): void;
			stagingSnapshot(): {
				beforeHTML: string;
				currentHTML: string;
				mutations: string[];
				sameNodes: boolean;
				beforeControlledValue: string;
				currentControlledValue: string;
				beforeControls: ReturnType<typeof controlSnapshot>;
				currentControls: ReturnType<typeof controlSnapshot>;
				customEvents: string[];
			};
		};
	}
}
