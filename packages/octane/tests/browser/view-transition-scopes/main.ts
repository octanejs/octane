import {
	addTransitionType,
	createRoot,
	createElement,
	ViewTransition,
	flushSync,
	startTransition,
	type ViewTransitionInstance,
} from 'octane';
import { App, type AppProps } from './App.tsrx';

type Status = 'pending' | 'fulfilled' | 'rejected';
type Update = Partial<
	Pick<
		AppProps,
		| 'left'
		| 'right'
		| 'inner'
		| 'page'
		| 'rootName'
		| 'boundaryName'
		| 'classFollowsText'
		| 'scopeValue'
		| 'elementScope'
		| 'outerScope'
	>
>;
type NativeUpdate = () => void | Promise<void>;
type NativeOptions = NativeUpdate | { update?: NativeUpdate; types?: string[] };
interface NativeHandle {
	ready: Promise<void>;
	updateCallbackDone: Promise<void>;
	finished: Promise<void>;
	skipTransition(): void;
}
type NativeStart = (options?: NativeOptions) => NativeHandle;
type NativeOwner = (Element | Document) & {
	startViewTransition?: NativeStart;
	activeViewTransition?: NativeHandle | null;
};
interface NativeObservation {
	owner: string;
	ready: Status;
	update: Status;
	finished: Status;
	error: string | null;
}
interface Observation {
	id: string;
	name: string;
	types: string[];
	targets: string[];
	animatedTarget: string;
	styleOwner: string;
	refName: string | null;
	refGroup: string | null;
	matchesRef: boolean;
}

const elementPrototype = Element.prototype as NativeOwner;
const documentOwner = document as NativeOwner;
const nativeElementStart = elementPrototype.startViewTransition;
const nativeDocumentStart = documentOwner.startViewTransition;
const calls: NativeObservation[] = [];
const handles: NativeHandle[] = [];
const pending: Promise<unknown>[] = [];
const events: Observation[] = [];
const cleanups: string[] = [];
const layouts: number[] = [];
const controls = new Map<string, (text: string) => void>();
const scopeRefs: AppProps['scopeRefs'] = {
	left: { current: null },
	right: { current: null },
	inner: { current: null },
};
let outsideClicks = 0;

function ownerName(element: Element | Document | null | undefined): string {
	return element === document || element === document.documentElement
		? 'document'
		: ((element as Element | undefined)?.id ?? 'missing');
}

// Retain native capture and callback scheduling, observing only public outcomes.
function observeNative(owner: NativeOwner, start: NativeStart, options?: NativeOptions) {
	const handle = start.call(owner, options);
	const observation: NativeObservation = {
		owner: ownerName(owner),
		ready: 'pending',
		update: 'pending',
		finished: 'pending',
		error: null,
	};
	calls.push(observation);
	handles.push(handle);
	for (const [key, promise] of [
		['ready', handle.ready],
		['update', handle.updateCallbackDone],
		['finished', handle.finished],
	] as const) {
		pending.push(
			promise.then(
				() => {
					observation[key] = 'fulfilled';
				},
				(error: Error) => {
					observation[key] = 'rejected';
					observation.error = error.name;
				},
			),
		);
	}
	return handle;
}
if (nativeElementStart) {
	elementPrototype.startViewTransition = function (options?: NativeOptions) {
		return observeNative(this as NativeOwner, nativeElementStart, options);
	};
}
if (nativeDocumentStart) {
	documentOwner.startViewTransition = function (options?: NativeOptions) {
		return observeNative(documentOwner, nativeDocumentStart, options);
	};
}

function record(id: string, instance: ViewTransitionInstance, types: string[]) {
	const animations = instance.new.getAnimations();
	const animated = instance.new.animate({ opacity: [0.5, 1] }, { duration: 1000 });
	events.push({
		id,
		name: instance.name,
		types: [...types],
		targets: animations.map((animation) => ownerName((animation.effect as KeyframeEffect).target)),
		animatedTarget: ownerName((animated.effect as KeyframeEffect).target),
		styleOwner: instance.new.getComputedStyle().getPropertyValue('--scope-owner').trim(),
		refName: scopeRefs[id.replace(/-root$/, '')]?.current?.name ?? null,
		refGroup: scopeRefs[id.replace(/-root$/, '')]?.current?.group.selector ?? null,
		matchesRef: scopeRefs[id.replace(/-root$/, '')]?.current === instance,
	});
	animated.cancel();
	return () => cleanups.push(id);
}

const mode = new URL(location.href).searchParams.get('mode') as AppProps['mode'] | null;
const initialClass = new URL(location.href).searchParams.get('initialClass');
let props: AppProps = {
	mode: mode ?? 'single',
	generation: 0,
	left: initialClass ?? 'left-before',
	classFollowsText: initialClass !== null,
	right: 'right-before',
	inner: 'inner-before',
	page: 'page-before',
	onLayout: (generation) => {
		layouts.push(generation);
	},
	onOutsideClick: () => {
		outsideClicks++;
	},
	onTransition: record,
	scopeRefs,
	onPanelControl: (id, update) => {
		if (update) controls.set(id, update);
		else controls.delete(id);
	},
};
const root = createRoot(document.querySelector('#root')!);
root.render(App, props);

function render(update: Update, types: string[] = [], urgent = false) {
	const mark = {
		generation: props.generation + 1,
		call: calls.length,
		event: events.length,
		cleanup: cleanups.length,
	};
	props = { ...props, ...update, generation: mark.generation };
	if (urgent) flushSync(() => root.render(App, props));
	else
		startTransition(() => {
			for (const type of types) addTransitionType(type);
			root.render(App, props);
		});
	return mark;
}
function renderLocal(id: string, text: string, types: string[] = [], urgent = false) {
	const mark = {
		generation: props.generation,
		call: calls.length,
		event: events.length,
		cleanup: cleanups.length,
	};
	const update = controls.get(id);
	if (!update) throw new Error('Missing panel control: ' + id);
	if (urgent) update(text);
	else
		startTransition(() => {
			for (const type of types) addTransitionType(type);
			update(text);
		});
	return mark;
}
function snapshot() {
	return {
		calls: calls.map((call) => ({ ...call })),
		events: events.map((event) => ({ ...event })),
		cleanups: [...cleanups],
		layouts: [...layouts],
		outsideClicks,
		refs: Object.fromEntries(
			Object.entries(scopeRefs).map(([id, ref]) => [id, ref.current?.name ?? null]),
		),
		active: ['document', 'left', 'right', 'inner'].filter((id) => {
			const owner =
				id === 'document' ? documentOwner : (document.getElementById(id) as NativeOwner | null);
			return Boolean(owner?.activeViewTransition);
		}),
		roots: [...document.querySelectorAll('section')].map((element) => ({
			id: element.id,
			scope: getComputedStyle(element).getPropertyValue('view-transition-scope'),
			name: getComputedStyle(element).viewTransitionName,
			inlineName: (element as HTMLElement).style.viewTransitionName,
			types: ['first', 'second'].filter((type) =>
				element.matches(`:active-view-transition-type(${type})`),
			),
		})),
	};
}
async function ready(mark: ReturnType<typeof render>) {
	await Promise.allSettled(handles.slice(mark.call).map((handle) => handle.ready));
	await Promise.resolve();
	return snapshot();
}
async function finish() {
	for (const handle of handles) handle.skipTransition();
	await Promise.all(pending);
	await Promise.resolve();
	return snapshot();
}

async function foreignScope(adoptStyle: boolean) {
	const frame = document.createElement('iframe');
	document.body.append(frame);
	const owner = frame.contentDocument!;
	const container = owner.createElement('div');
	owner.body.append(container);
	const existing = adoptStyle
		? (document
				.querySelector<HTMLStyleElement>('style[data-octane="octane-view-transition-scope"]')!
				.cloneNode(true) as HTMLStyleElement)
		: null;
	if (existing !== null) owner.head.append(existing);
	const foreignRoot = createRoot(container);
	const output = (text: string, scoped = true, onMount?: () => void) =>
		createElement(
			ViewTransition,
			{ scope: scoped ? 'element' : undefined },
			createElement('section', { ref: onMount }, text),
		);
	const scope = () =>
		frame
			.contentWindow!.getComputedStyle(container.firstElementChild!)
			.getPropertyValue('view-transition-scope');
	try {
		foreignRoot.render(createElement('span', null, 'before scope'));
		await new Promise<void>((resolve) => {
			startTransition(() => foreignRoot.render(output('foreign-before', true, resolve)));
		});
		const mounted = scope();
		flushSync(() => foreignRoot.render(output('foreign-after')));
		const updated = { scope: scope(), text: container.textContent };
		let disabled: string | null = null;
		if (existing !== null) {
			existing.disabled = true;
			disabled = scope();
			existing.disabled = false;
		}
		flushSync(() => foreignRoot.render(output('unscoped', false)));
		return { mounted, updated, disabled, released: scope() };
	} finally {
		flushSync(() => foreignRoot.unmount());
		frame.remove();
	}
}

window.__viewTransitionScopes = {
	render,
	renderLocal,
	foreignScope,
	ready,
	snapshot,
	finish,
	async unmount() {
		try {
			flushSync(() => root.unmount());
			await finish();
		} finally {
			elementPrototype.startViewTransition = nativeElementStart;
			documentOwner.startViewTransition = nativeDocumentStart;
		}
	},
};
declare global {
	interface Window {
		__viewTransitionScopes: {
			render: typeof render;
			renderLocal: typeof renderLocal;
			foreignScope: typeof foreignScope;
			ready: typeof ready;
			snapshot: typeof snapshot;
			finish: typeof finish;
			unmount(): Promise<void>;
		};
	}
}
