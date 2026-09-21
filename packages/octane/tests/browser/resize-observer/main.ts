import { createRoot, createResizeObserver, hydrateRoot } from 'octane';
import { ResizeFeedback } from '../../_fixtures/resize-observer.tsrx';

const errors: string[] = [];
window.addEventListener('error', (event) => errors.push(event.message));
const root = document.querySelector<HTMLElement>('#root')!;
let ready = false;
let adoptedPanel: Element | null = null;
let adoptedInner: Element | null = null;
let updateWidth: (width: number) => void = () => {};

async function settle(): Promise<void> {
	await new Promise<void>((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
	);
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function element(name: string, width: number, documentOwner = document): HTMLDivElement {
	const target = documentOwner.createElement('div');
	target.dataset.target = name;
	target.style.cssText = `width:${width}px;height:30px;padding:10px;border:5px solid black;box-sizing:content-box`;
	documentOwner.body.append(target);
	return target;
}

function entrySnapshot(entries: ResizeObserverEntry[]) {
	return entries
		.map((entry) => ({
			target: (entry.target as HTMLElement).dataset.target,
			width: entry.contentRect.width,
			borderWidth: entry.borderBoxSize[0].inlineSize,
		}))
		.sort((first, second) => (first.target ?? '').localeCompare(second.target ?? ''));
}

const cases = {
	get ready() {
		return ready;
	},
	get errors() {
		return errors;
	},
	mount(observe: boolean) {
		createRoot(root).render(ResizeFeedback, {
			observe,
			expose(update: (width: number) => void) {
				updateWidth = update;
			},
			ready() {
				ready = true;
			},
		});
	},
	hydrate(html: string) {
		root.innerHTML = html;
		adoptedPanel = root.querySelector('[data-panel]');
		adoptedInner = root.querySelector('[data-observed]');
		hydrateRoot(root, ResizeFeedback, {
			observe: true,
			expose(update: (width: number) => void) {
				updateWidth = update;
			},
			ready() {
				ready = true;
			},
		});
	},
	adopted() {
		return Boolean(
			adoptedPanel &&
			adoptedInner &&
			root.querySelector('[data-panel]') === adoptedPanel &&
			root.querySelector('[data-observed]') === adoptedInner,
		);
	},
	width() {
		return root.querySelector<HTMLElement>('[data-observed]')!.getBoundingClientRect().width;
	},
	update(width: number) {
		updateWidth(width);
	},
	settle,
	async coalesce() {
		const parent = element('parent', 400);
		const first = element('first', 100);
		const second = element('second', 200);
		parent.append(first, second);
		const deliveries: ReturnType<typeof entrySnapshot>[] = [];
		let identity = { native: false, observer: false, receiver: false, constructor: false };
		const nativeCtor = window.ResizeObserver;
		let done!: () => void;
		const delivered = new Promise<void>((resolve) => {
			done = resolve;
		});
		const helper = createResizeObserver(function (this: ResizeObserver, entries, observer) {
			deliveries.push(entrySnapshot(entries));
			identity = {
				native: helper instanceof nativeCtor,
				observer: observer === helper,
				receiver: this === helper,
				constructor: window.ResizeObserver === nativeCtor,
			};
			done();
		});
		// A shallower native observation changes both descendants during the same
		// delivery loop. Their newer entries must replace the first measurements.
		const gate = new ResizeObserver(() => {
			first.style.width = '120px';
			second.style.width = '240px';
			gate.disconnect();
		});
		helper.observe(first);
		helper.observe(second);
		gate.observe(parent);
		await delivered;
		await settle();
		helper.disconnect();
		return { deliveries, identity, errors };
	},
	async cancel(kind: 'disconnect' | 'unobserve' | 'repeat') {
		const first = element('first', 100);
		const second = element('second', 200);
		const deliveries: ReturnType<typeof entrySnapshot>[] = [];
		let cancelled!: () => void;
		const cancellation = new Promise<void>((resolve) => {
			cancelled = resolve;
		});
		const helper = createResizeObserver((entries) => deliveries.push(entrySnapshot(entries)));
		const gate = new ResizeObserver(() => {
			if (kind === 'disconnect') helper.disconnect();
			else if (kind === 'unobserve') helper.unobserve(first);
			else helper.observe(first, { box: 'content-box' });
			gate.disconnect();
			cancelled();
		});
		helper.observe(first);
		helper.observe(second);
		gate.observe(first);
		await cancellation;
		await settle();
		helper.disconnect();
		return { deliveries, errors };
	},
	async boxChanges() {
		const target = element('target', 100);
		let nextDelivery!: (entries: ReturnType<typeof entrySnapshot>) => void;
		const next = () =>
			new Promise<ReturnType<typeof entrySnapshot>>((resolve) => {
				nextDelivery = resolve;
			});
		const helper = createResizeObserver((entries) => nextDelivery(entrySnapshot(entries)));
		let delivery = next();
		helper.observe(target, { box: 'content-box' });
		const initial = await delivery;
		helper.unobserve(target);
		target.style.width = '160px';
		target.style.padding = '20px';
		delivery = next();
		helper.observe(target, { box: 'border-box' });
		const reobserved = await delivery;
		target.style.padding = '30px';
		delivery = next();
		const borderChange = await delivery;
		helper.disconnect();
		await settle();
		return { initial, reobserved, borderChange, errors };
	},
	async iframe() {
		const iframe = document.createElement('iframe');
		const loaded = new Promise<void>((resolve) => {
			iframe.onload = () => resolve();
		});
		iframe.srcdoc = '<!doctype html><html><body></body></html>';
		document.body.append(iframe);
		await loaded;
		const owner = iframe.contentWindow as Window & { ResizeObserver: typeof ResizeObserver };
		const target = element('iframe-target', 75, iframe.contentDocument!);
		let done!: (value: {
			entries: ReturnType<typeof entrySnapshot>;
			native: boolean;
			observer: boolean;
			receiver: boolean;
		}) => void;
		const delivered = new Promise<Parameters<typeof done>[0]>((resolve) => {
			done = resolve;
		});
		const helper = createResizeObserver(function (this: ResizeObserver, entries, observer) {
			done({
				entries: entrySnapshot(entries),
				native: helper instanceof owner.ResizeObserver,
				observer: observer === helper,
				receiver: this === helper,
			});
		}, owner.ResizeObserver);
		helper.observe(target);
		const result = await delivered;
		helper.disconnect();
		await settle();
		iframe.remove();
		return { ...result, errors };
	},
	async convertedOptions() {
		const first = element('first', 100);
		const second = element('second', 200);
		let getterReads = 0;
		let conversions = 0;
		const box = {
			toString() {
				conversions++;
				return 'content-box';
			},
		};
		const options = {
			get box() {
				getterReads++;
				return box as unknown as ResizeObserverBoxOptions;
			},
		};
		let done!: (entries: ReturnType<typeof entrySnapshot>) => void;
		const delivered = new Promise<ReturnType<typeof entrySnapshot>>((resolve) => {
			done = resolve;
		});
		const helper = createResizeObserver((entries) => done(entrySnapshot(entries)));
		const gate = new ResizeObserver(() => {
			helper.observe(first, { box: 'content-box' });
			gate.disconnect();
		});
		helper.observe(first, options);
		helper.observe(second);
		gate.observe(first);
		const entries = await delivered;
		helper.disconnect();
		await settle();
		return { entries, getterReads, conversions, errors };
	},
	validation() {
		const callbackFailures = [null, undefined, {}, 'callback'].map((callback) => {
			try {
				createResizeObserver(callback as ResizeObserverCallback);
				return false;
			} catch (error) {
				return error instanceof TypeError;
			}
		});
		let getterReads = 0;
		const options = {
			get box() {
				getterReads++;
				return 'content-box' as const;
			},
		};
		const helper = createResizeObserver(() => {});
		const target = element('valid', 100);
		let receiverFailure = false;
		let targetFailure = false;
		try {
			helper.observe.call({} as ResizeObserver, target, options);
		} catch (error) {
			receiverFailure = error instanceof TypeError;
		}
		try {
			helper.observe({} as Element, options);
		} catch (error) {
			targetFailure = error instanceof TypeError;
		}
		helper.disconnect();
		return { callbackFailures, getterReads, receiverFailure, targetFailure, errors };
	},
	async ownCallProperty() {
		const target = element('target', 100);
		let callbackCalled = false;
		let ownCallCalled = false;
		let receiver = false;
		let identity = false;
		let done!: () => void;
		const delivered = new Promise<void>((resolve) => {
			done = resolve;
		});
		function callback(
			this: ResizeObserver,
			_entries: ResizeObserverEntry[],
			observer: ResizeObserver,
		) {
			callbackCalled = true;
			receiver = this === helper;
			identity = observer === helper;
			done();
		}
		Object.defineProperty(callback, 'call', {
			value() {
				ownCallCalled = true;
				done();
			},
		});
		const helper = createResizeObserver(callback);
		helper.observe(target);
		await delivered;
		helper.disconnect();
		await settle();
		return { callbackCalled, ownCallCalled, receiver, identity, errors };
	},
	async callbackError() {
		const first = element('throwing', 100);
		const second = element('surviving', 200);
		let done!: (entries: ReturnType<typeof entrySnapshot>) => void;
		const delivered = new Promise<ReturnType<typeof entrySnapshot>>((resolve) => {
			done = resolve;
		});
		const throwing = createResizeObserver(() => {
			throwing.disconnect();
			throw new Error('resize-observer callback failure');
		});
		const surviving = createResizeObserver((entries) => done(entrySnapshot(entries)));
		throwing.observe(first);
		surviving.observe(second);
		const entries = await delivered;
		surviving.disconnect();
		await settle();
		return { entries, errors };
	},
};

window.__resizeObserverCases = cases;

declare global {
	interface Window {
		__resizeObserverCases: typeof cases;
	}
}
