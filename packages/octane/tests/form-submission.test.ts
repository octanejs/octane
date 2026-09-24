import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	attachBehaviorRoot,
	captureFormSubmissions,
	type BehaviorContext,
	type BehaviorEntry,
	type BehaviorRoot,
	type CapturedFormSubmission,
} from 'octane';
import { earlySignalBootstrapScript, type EarlySignalBootstrapOptions } from 'octane/server';
import {
	createIndependentHydrateManifest,
	initializeHydrationEventCapture,
	registerIndependentHydrationIsland,
	type IndependentHydrateActivationContext,
} from 'octane/hydration';

type Delivery = {
	event: Event;
	element: Element;
	context: BehaviorContext;
	payload: CapturedFormSubmission | undefined;
};

const frames: HTMLIFrameElement[] = [];
const roots: BehaviorRoot[] = [];
const islands: Array<() => void> = [];
const FORM =
	'<main><section><form id="composer" action="/send" data-octane-capture-submit="save">' +
	'<textarea name="draft">accepted</textarea><button type="submit" name="intent" value="send">Send</button>' +
	'</form></section><aside></aside></main>';

function frameDocument(): Document {
	const frame = document.createElement('iframe');
	document.body.appendChild(frame);
	frames.push(frame);
	return frame.contentDocument!;
}

function earlyDocument(
	html = FORM,
	options: EarlySignalBootstrapOptions = { formSubmissions: true },
	beforeBootstrap?: (ownerDocument: Document) => void,
): Document {
	const ownerDocument = frameDocument();
	beforeBootstrap?.(ownerDocument);
	const script = earlySignalBootstrapScript(options);
	// Execute the public inline artifact before exposing interactive HTML, as the
	// early-independent-intent harness does. No generated-module rewriting.
	const source = script.slice(script.indexOf('>') + 1, script.lastIndexOf('</script>'));
	new Function('document', 'globalThis', source)(ownerDocument, ownerDocument.defaultView);
	ownerDocument.head.innerHTML = '<base href="https://example.test/page">';
	ownerDocument.body.innerHTML = html;
	return ownerDocument;
}

function attach(
	container: Element,
	options?: Parameters<typeof attachBehaviorRoot>[1],
): BehaviorRoot {
	const root = attachBehaviorRoot(container, {
		formSubmissions: captureFormSubmissions(),
		...options,
	});
	roots.push(root);
	return root;
}

function attachWithoutForms(
	container: Element,
	options?: Parameters<typeof attachBehaviorRoot>[1],
): BehaviorRoot {
	const root = attachBehaviorRoot(container, options);
	roots.push(root);
	return root;
}

function independentDocument(beforeBootstrap?: (ownerDocument: Document) => void): Document {
	const ownerDocument = earlyDocument(
		FORM.replace('<section>', '<section><div>').replace('</section>', '</div></section>'),
		{ independentHydration: true, formSubmissions: true },
		beforeBootstrap,
	);
	const boundary = ownerDocument.querySelector('section')!;
	boundary.setAttribute('data-octane-hydrate-id', 'form-widget');
	boundary.setAttribute('data-octane-hydrate-when', 'interaction');
	boundary.setAttribute('data-octane-hydrate-interaction-events', 'click');
	boundary.setAttribute('data-octane-hydrate-independent', '');
	return ownerDocument;
}

function registerIsland(ownerDocument: Document, moduleReady?: Promise<void>) {
	const boundary = ownerDocument.querySelector('section')!;
	const activations: IndependentHydrateActivationContext[] = [];
	const unmount = vi.fn();
	const load = vi.fn(async () => {
		if (moduleReady !== undefined) await moduleReady;
		return {
			default(context: IndependentHydrateActivationContext) {
				activations.push(context);
				return { unmount };
			},
		};
	});
	const manifest = createIndependentHydrateManifest(
		{
			version: 1,
			boundaryId: 'form-template',
			exportName: 'default',
			captureSchema: [],
			hookSeed: 0,
			idSeed: 0,
			signalSites: [],
			parentDependencies: false,
		},
		[],
		'form-widget',
		'form-intent-build',
		{ moduleId: 'form-widget.js', styles: [] },
	);
	const dispose = registerIndependentHydrationIsland(boundary, manifest, {
		load,
		loadStyles() {},
	});
	islands.push(dispose);
	return { boundary, activations, load, unmount, dispose };
}

function submit(form: HTMLFormElement, submitter: HTMLElement | null = null): SubmitEvent {
	const event = new form.ownerDocument.defaultView!.SubmitEvent('submit', {
		bubbles: true,
		cancelable: true,
		submitter,
	});
	form.dispatchEvent(event);
	return event;
}

function deferred(): { promise: Promise<void>; resolve(): void } {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function acceptedSubmission(
	_event: Event,
	_element: Element,
	submission?: CapturedFormSubmission,
): CapturedFormSubmission | undefined {
	return submission;
}

function registerSave(
	root: BehaviorRoot,
	deliveries: Delivery[],
	options: Partial<BehaviorEntry<CapturedFormSubmission | undefined>> = {},
) {
	return root.registerBehavior<CapturedFormSubmission | undefined>({
		id: 'save',
		target: 'form',
		events: ['submit'],
		captureEvent: acceptedSubmission,
		adopt() {},
		handleEvent(event, element, context, payload) {
			deliveries.push({ event, element, context, payload });
		},
		...options,
	});
}

afterEach(() => {
	for (const dispose of islands.splice(0)) dispose();
	for (const root of roots.splice(0)) root.dispose();
	for (const frame of frames.splice(0)) {
		const ownerWindow = frame.contentDocument!.defaultView!;
		ownerWindow.dispatchEvent(new ownerWindow.Event('pagehide'));
		frame.remove();
	}
	vi.useRealTimers();
});

describe('parser-time native form commands', () => {
	it.each(
		['native requestSubmit timer', 'dispatched submit microtask'].flatMap((path) =>
			['factory first', 'capture first'].flatMap((order) =>
				['historical', 'live'].map((phase) => ({ path, order, phase })),
			),
		),
	)('activates the original $phase $path with $order', async ({ path, order, phase }) => {
		vi.useFakeTimers();
		const ownerDocument = independentDocument();
		const form = ownerDocument.querySelector('form')!;
		const button = ownerDocument.querySelector('button')!;
		const events: SubmitEvent[] = [];
		form.addEventListener('submit', (event) => events.push(event));
		const accept = () => {
			if (path === 'native requestSubmit timer') form.requestSubmit(button);
			else submit(form, button);
		};
		if (phase === 'historical') accept();
		const ready = deferred();
		const deliveries: Delivery[] = [];
		if (order === 'capture first') initializeHydrationEventCapture(ownerDocument);
		const registration = registerSave(attach(ownerDocument.querySelector('main')!), deliveries, {
			ready: ready.promise,
		});
		if (order === 'factory first') initializeHydrationEventCapture(ownerDocument);
		const island = registerIsland(ownerDocument);
		if (phase === 'live') accept();
		expect(events).toHaveLength(1);
		const original = events[0];
		expect(original.isTrusted).toBe(path === 'native requestSubmit timer');
		expect(original.defaultPrevented).toBe(true);
		expect(island.load).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(0);
		expect(island.load).toHaveBeenCalledOnce();
		expect(island.activations).toHaveLength(1);
		expect(island.activations[0].element).toBe(island.boundary);
		expect(island.activations[0].intents).toHaveLength(1);
		expect(island.activations[0].intents[0].event).toBe(original);
		expect(island.activations[0].intents[0].earlyBinding).toBe(true);
		expect(events).toEqual([original]);
		expect(deliveries).toEqual([]);
		ownerDocument.querySelector('textarea')!.value = 'edited';
		ready.resolve();
		await registration.ready;
		expect(deliveries.map(({ event }) => event)).toEqual([original]);
		expect(deliveries[0].payload?.fields).toEqual([
			['draft', 'accepted'],
			['intent', 'send'],
		]);
		await vi.advanceTimersByTimeAsync(0);
		expect(island.load).toHaveBeenCalledOnce();
		expect(events).toEqual([original]);
		island.dispose();
		expect(island.unmount).toHaveBeenCalledOnce();
	});

	it.each([
		'boundary identity',
		'strategy',
		'events',
		'form marker',
		'form parent',
		'independent owner',
	] as const)('drops deferred native activation after a change to %s', async (change) => {
		vi.useFakeTimers();
		const ownerDocument = independentDocument();
		const form = ownerDocument.querySelector('form')!;
		const button = ownerDocument.querySelector('button')!;
		const island = registerIsland(ownerDocument);
		attach(ownerDocument.querySelector('main')!);
		const events: SubmitEvent[] = [];
		form.addEventListener('submit', (event) => events.push(event));
		form.requestSubmit(button);
		expect(events).toHaveLength(1);
		expect(events[0].isTrusted).toBe(true);
		expect(events[0].defaultPrevented).toBe(true);
		if (change === 'boundary identity')
			island.boundary.setAttribute('data-octane-hydrate-id', 'replacement');
		else if (change === 'strategy')
			island.boundary.setAttribute('data-octane-hydrate-when', 'idle');
		else if (change === 'events')
			island.boundary.setAttribute('data-octane-hydrate-interaction-events', 'pointerdown');
		else if (change === 'form marker') form.setAttribute('data-octane-capture-submit', 'other');
		else if (change === 'form parent') {
			const parent = ownerDocument.createElement('div');
			island.boundary.appendChild(parent);
			parent.appendChild(form);
		} else {
			const nested = ownerDocument.createElement('aside');
			nested.setAttribute('data-octane-hydrate-id', 'nested-widget');
			nested.setAttribute('data-octane-hydrate-when', 'interaction');
			nested.setAttribute('data-octane-hydrate-independent', '');
			island.boundary.appendChild(nested);
			nested.appendChild(form.parentElement!);
		}
		await vi.advanceTimersByTimeAsync(0);
		expect(island.load).not.toHaveBeenCalled();
		expect(island.activations).toEqual([]);
		expect(events).toHaveLength(1);
	});

	it.each(['factory before events', 'factory after events'] as const)(
		'preserves both selections around a deferred accepted native command with %s',
		async (order) => {
			vi.useFakeTimers();
			const ownerDocument = independentDocument();
			const boundary = ownerDocument.querySelector('section')!;
			const form = ownerDocument.querySelector('form')!;
			const submitter = ownerDocument.querySelector('button')!;
			const first = ownerDocument.createElement('button');
			const last = ownerDocument.createElement('button');
			for (const button of [first, last]) {
				button.type = 'button';
				button.setAttribute('data-octane-hydrate-selection', 'day');
				boundary.appendChild(button);
			}
			first.textContent = 'Monday';
			last.textContent = 'Tuesday';
			const selectionEvents: MouseEvent[] = [];
			ownerDocument.addEventListener('click', (event) => selectionEvents.push(event), true);
			const submissions: SubmitEvent[] = [];
			form.addEventListener('submit', (event) => submissions.push(event));
			const moduleReady = deferred();
			const island = registerIsland(ownerDocument, moduleReady.promise);
			if (order === 'factory before events') attach(ownerDocument.querySelector('main')!);
			first.click();
			form.requestSubmit(submitter);
			last.click();
			if (order === 'factory after events') attach(ownerDocument.querySelector('main')!);
			expect(selectionEvents).toHaveLength(2);
			expect(submissions).toHaveLength(1);
			expect(submissions[0].isTrusted).toBe(true);
			expect(submissions[0].defaultPrevented).toBe(true);
			await vi.advanceTimersByTimeAsync(0);
			expect(island.load).toHaveBeenCalledOnce();
			expect(island.activations).toEqual([]);
			moduleReady.resolve();
			await vi.advanceTimersByTimeAsync(0);
			expect(island.activations).toHaveLength(1);
			const intents = island.activations[0].intents;
			const selections = intents.filter(({ event }) => event.type === 'click');
			expect(selections).toHaveLength(2);
			expect(selections[0].event).toBe(selectionEvents[0]);
			expect(selections[1].event).toBe(selectionEvents[1]);
			const commands = intents.filter(({ event }) => event.type === 'submit');
			expect(commands).toHaveLength(1);
			expect(commands[0].event).toBe(submissions[0]);
			expect(commands[0].earlyBinding).toBe(true);
			expect(submissions).toHaveLength(1);
		},
	);

	it.each(['strategy', 'events'] as const)(
		'retires independent activation after %s changes before the factory while preserving accepted fields',
		async (change) => {
			vi.useFakeTimers();
			const ownerDocument = independentDocument();
			const form = ownerDocument.querySelector('form')!;
			const button = ownerDocument.querySelector('button')!;
			const island = registerIsland(ownerDocument);
			const events: SubmitEvent[] = [];
			form.addEventListener('submit', (event) => events.push(event));
			form.requestSubmit(button);
			expect(events).toHaveLength(1);
			const original = events[0];
			expect(original.isTrusted).toBe(true);
			expect(original.defaultPrevented).toBe(true);
			if (change === 'strategy') island.boundary.setAttribute('data-octane-hydrate-when', 'idle');
			else island.boundary.setAttribute('data-octane-hydrate-interaction-events', 'pointerdown');
			ownerDocument.querySelector('textarea')!.value = 'edited';
			const ready = deferred();
			const deliveries: Delivery[] = [];
			const capture = vi.fn(acceptedSubmission);
			const registration = registerSave(attach(ownerDocument.querySelector('main')!), deliveries, {
				ready: ready.promise,
				captureEvent: capture,
			});
			expect(capture).toHaveBeenCalledOnce();
			expect(capture.mock.calls[0][0]).toBe(original);
			await vi.advanceTimersByTimeAsync(0);
			expect(island.load).not.toHaveBeenCalled();
			expect(island.activations).toEqual([]);
			expect(deliveries).toEqual([]);
			ready.resolve();
			await registration.ready;
			expect(deliveries.map(({ event }) => event)).toEqual([original]);
			expect(deliveries[0].payload?.fields).toEqual([
				['draft', 'accepted'],
				['intent', 'send'],
			]);
			expect(events).toEqual([original]);
		},
	);

	it.each(
		['pending registration', 'loading module'].flatMap((stage) =>
			['lease expiry', 'root disposal', 'form marker', 'form parent'].map((change) => ({
				stage,
				change,
			})),
		),
	)('drops a native command after $change during $stage', async ({ stage, change }) => {
		vi.useFakeTimers();
		const ownerDocument = independentDocument();
		const form = ownerDocument.querySelector('form')!;
		const button = ownerDocument.querySelector('button')!;
		const root = attach(ownerDocument.querySelector('main')!);
		const moduleReady = deferred();
		let island =
			stage === 'loading module' ? registerIsland(ownerDocument, moduleReady.promise) : undefined;
		const events: SubmitEvent[] = [];
		form.addEventListener('submit', (event) => events.push(event));
		form.requestSubmit(button);
		expect(events).toHaveLength(1);
		const original = events[0];
		expect(original.isTrusted).toBe(true);
		expect(original.defaultPrevented).toBe(true);
		await vi.advanceTimersByTimeAsync(0);
		if (island !== undefined) {
			expect(island.load).toHaveBeenCalledOnce();
			expect(island.activations).toEqual([]);
		}
		if (change === 'lease expiry') await vi.advanceTimersByTimeAsync(30_000);
		else if (change === 'root disposal') root.dispose();
		else if (change === 'form marker') form.setAttribute('data-octane-capture-submit', 'other');
		else {
			const parent = ownerDocument.createElement('div');
			ownerDocument.querySelector('section')!.appendChild(parent);
			parent.appendChild(form);
		}
		if (island === undefined) island = registerIsland(ownerDocument);
		moduleReady.resolve();
		await vi.advanceTimersByTimeAsync(0);
		if (stage === 'pending registration') expect(island.load).not.toHaveBeenCalled();
		expect(island.activations).toEqual([]);
		expect(events).toEqual([original]);
	});

	it.each(['historical selections', 'historical and live selections'] as const)(
		'preserves %s separated by a native command that expires before registration',
		async (position) => {
			vi.useFakeTimers();
			const selectionEvents: MouseEvent[] = [];
			const ownerDocument = independentDocument((ownerDocument) => {
				ownerDocument.addEventListener('click', (event) => selectionEvents.push(event), true);
			});
			const boundary = ownerDocument.querySelector('section')!;
			const form = ownerDocument.querySelector('form')!;
			const submitter = ownerDocument.querySelector('button')!;
			const first = ownerDocument.createElement('button');
			const last = ownerDocument.createElement('button');
			for (const button of [first, last]) {
				button.type = 'button';
				button.setAttribute('data-octane-hydrate-selection', 'day');
				boundary.appendChild(button);
			}
			first.textContent = 'Monday';
			last.textContent = 'Tuesday';
			const submissions: SubmitEvent[] = [];
			form.addEventListener('submit', (event) => submissions.push(event));
			first.click();
			form.requestSubmit(submitter);
			if (position === 'historical selections') last.click();
			expect(submissions).toHaveLength(1);
			const original = submissions[0];
			expect(original.isTrusted).toBe(true);
			expect(original.defaultPrevented).toBe(true);
			await vi.advanceTimersByTimeAsync(30_000);
			const deliveries: Delivery[] = [];
			const capture = vi.fn(acceptedSubmission);
			await registerSave(attach(ownerDocument.querySelector('main')!), deliveries, {
				captureEvent: capture,
			}).ready;
			const moduleReady = deferred();
			const island = registerIsland(ownerDocument, moduleReady.promise);
			if (position === 'historical and live selections') last.click();
			expect(selectionEvents).toHaveLength(2);
			await vi.advanceTimersByTimeAsync(0);
			expect(island.load).toHaveBeenCalledOnce();
			expect(island.activations).toEqual([]);
			moduleReady.resolve();
			await vi.advanceTimersByTimeAsync(0);
			expect(island.activations).toHaveLength(1);
			const intents = island.activations[0].intents;
			const selections = intents.filter(({ event }) => event.type === 'click');
			expect(selections).toHaveLength(2);
			expect(selections[0].event).toBe(selectionEvents[0]);
			expect(selections[1].event).toBe(selectionEvents[1]);
			expect(intents.filter(({ event }) => event.type === 'submit')).toEqual([]);
			expect(capture).not.toHaveBeenCalled();
			expect(deliveries).toEqual([]);
			expect(submissions).toEqual([original]);
			expect(selectionEvents).toHaveLength(2);
		},
	);

	it.each(['parent', 'marker', 'range owner'] as const)(
		'captures a newly appended form once but drops delivery when adoption changes its %s',
		async (change) => {
			const ownerDocument = earlyDocument('<main><section></section><aside></aside></main>');
			const section = ownerDocument.querySelector('section')!;
			const root = attach(ownerDocument.querySelector('main')!);
			const owner = {};
			root.registerExternalRange(section, { owner });
			const deliveries: Delivery[] = [];
			const capture = vi.fn(acceptedSubmission);
			const adopt = vi.fn((element: Element) => {
				if (change === 'marker') element.setAttribute('data-octane-capture-submit', 'other');
				else if (change === 'range owner') root.registerExternalRange(element, { owner: {} });
				else {
					const parent = ownerDocument.createElement('div');
					section.appendChild(parent);
					parent.appendChild(element);
				}
			});
			await registerSave(root, deliveries, { owner, captureEvent: capture, adopt }).ready;
			const form = ownerDocument.createElement('form');
			form.setAttribute('data-octane-capture-submit', 'save');
			form.innerHTML =
				'<textarea name="draft">accepted</textarea><button type="submit">Send</button>';
			section.appendChild(form);
			const original = submit(form, form.querySelector('button')!);
			expect(original.defaultPrevented).toBe(true);
			expect(capture).toHaveBeenCalledOnce();
			expect(capture.mock.calls[0][0]).toBe(original);
			expect(capture.mock.calls[0][1]).toBe(form);
			expect(capture.mock.calls[0][2]?.fields).toEqual([['draft', 'accepted']]);
			expect(adopt).toHaveBeenCalledOnce();
			expect(adopt.mock.calls[0][0]).toBe(form);
			expect(deliveries).toEqual([]);
			await Promise.resolve();
			expect(capture).toHaveBeenCalledOnce();
			expect(adopt).toHaveBeenCalledOnce();
			expect(deliveries).toEqual([]);
		},
	);

	it.each(['synchronous', 'pending'] as const)(
		'revokes island activation when %s adoption changes a claimed native command range owner',
		async (mode) => {
			vi.useFakeTimers();
			const ownerDocument = independentDocument();
			const form = ownerDocument.querySelector('form')!;
			const parent = form.parentElement!;
			const button = ownerDocument.querySelector('button')!;
			form.remove();
			const root = attach(ownerDocument.querySelector('main')!);
			const owner = {};
			root.registerExternalRange(parent, { owner });
			const deliveries: Delivery[] = [];
			const capture = vi.fn(acceptedSubmission);
			const adoptionReady = deferred();
			const adopt = vi.fn((element: Element) => {
				root.registerExternalRange(element, { owner: {} });
				if (mode === 'pending') return adoptionReady.promise;
			});
			await registerSave(root, deliveries, { owner, captureEvent: capture, adopt }).ready;
			const island = registerIsland(ownerDocument);
			const events: SubmitEvent[] = [];
			form.addEventListener('submit', (event) => events.push(event));
			parent.appendChild(form);
			form.requestSubmit(button);
			expect(events).toHaveLength(1);
			const original = events[0];
			expect(original.isTrusted).toBe(true);
			expect(original.defaultPrevented).toBe(true);
			expect(capture).toHaveBeenCalledOnce();
			expect(capture.mock.calls[0][0]).toBe(original);
			expect(capture.mock.calls[0][1]).toBe(form);
			expect(capture.mock.calls[0][2]?.fields).toEqual([
				['draft', 'accepted'],
				['intent', 'send'],
			]);
			expect(adopt).toHaveBeenCalledOnce();
			expect(adopt.mock.calls[0][0]).toBe(form);
			expect(deliveries).toEqual([]);
			await vi.advanceTimersByTimeAsync(0);
			expect(island.load).not.toHaveBeenCalled();
			expect(island.activations).toEqual([]);
			expect(capture).toHaveBeenCalledOnce();
			expect(adopt).toHaveBeenCalledOnce();
			expect(deliveries).toEqual([]);
			expect(events).toEqual([original]);
			adoptionReady.resolve();
			await vi.advanceTimersByTimeAsync(0);
			expect(island.load).not.toHaveBeenCalled();
			expect(island.activations).toEqual([]);
			expect(deliveries).toEqual([]);
		},
	);

	it('disposes a behavior root idempotently without a parser bootstrap', async () => {
		const ownerDocument = frameDocument();
		ownerDocument.body.innerHTML = FORM;
		const form = ownerDocument.querySelector('form')!;
		const root = attachWithoutForms(ownerDocument.querySelector('main')!);
		const cleanup = vi.fn();
		const deliveries: Delivery[] = [];
		const registration = registerSave(root, deliveries, { adopt: () => cleanup });
		await registration.ready;
		expect(() => root.dispose()).not.toThrow();
		expect(() => root.dispose()).not.toThrow();
		expect(root.signal.aborted).toBe(true);
		expect(registration.signal.aborted).toBe(true);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(ownerDocument.querySelector('form')).toBe(form);
		expect(submit(form).defaultPrevented).toBe(false);
		expect(deliveries).toEqual([]);
	});

	it('keeps native events ordinary for a default root without claiming accepted snapshots', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const root = attachWithoutForms(ownerDocument.querySelector('main')!);
		const historical = submit(form);
		ownerDocument.querySelector('textarea')!.value = 'edited';
		const deliveries: Delivery[] = [];
		const capture = vi.fn(acceptedSubmission);
		const registration = registerSave(root, deliveries, { captureEvent: capture });
		await registration.ready;
		expect(historical.defaultPrevented).toBe(true);
		expect(capture).not.toHaveBeenCalled();
		expect(deliveries).toEqual([]);
		const live = submit(form);
		expect(live.defaultPrevented).toBe(true);
		expect(capture).toHaveBeenCalledOnce();
		expect(capture).toHaveBeenCalledWith(live, form);
		expect(deliveries.map(({ event, payload }) => [event, payload])).toEqual([[live, undefined]]);
	});

	it('keeps an unconfigured child ordinary while configured ancestors and siblings capture', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const outer = attach(ownerDocument.querySelector('main')!);
		const outerDeliveries: Delivery[] = [];
		const outerCapture = vi.fn(acceptedSubmission);
		await registerSave(outer, outerDeliveries, { captureEvent: outerCapture }).ready;
		const inner = attachWithoutForms(ownerDocument.querySelector('section')!);
		const historical = submit(form);
		const innerDeliveries: Delivery[] = [];
		const innerCapture = vi.fn(acceptedSubmission);
		await registerSave(inner, innerDeliveries, { captureEvent: innerCapture }).ready;
		expect(historical.defaultPrevented).toBe(true);
		expect(innerCapture).not.toHaveBeenCalled();
		expect(outerCapture).not.toHaveBeenCalled();
		const live = submit(form);
		expect(live.defaultPrevented).toBe(true);
		expect(innerCapture).toHaveBeenCalledWith(live, form);
		expect(innerDeliveries.map(({ event, payload }) => [event, payload])).toEqual([
			[live, undefined],
		]);
		outer.dispose();
		expect(inner.signal.aborted).toBe(false);
		const afterOuter = submit(form);
		expect(afterOuter.defaultPrevented).toBe(true);
		expect(innerCapture).toHaveBeenLastCalledWith(afterOuter, form);
		const siblingContainer = ownerDocument.createElement('main');
		siblingContainer.innerHTML =
			'<form data-octane-capture-submit="save"><input name="draft" value="sibling"></form>';
		ownerDocument.body.appendChild(siblingContainer);
		const siblingForm = siblingContainer.querySelector('form')!;
		const siblingDeliveries: Delivery[] = [];
		await registerSave(attach(siblingContainer), siblingDeliveries).ready;
		const sibling = submit(siblingForm);
		expect(sibling.defaultPrevented).toBe(true);
		expect(siblingDeliveries.map(({ event }) => event)).toEqual([sibling]);
		expect(siblingDeliveries[0].payload?.fields).toEqual([['draft', 'sibling']]);
		const afterSibling = submit(form);
		expect(afterSibling.defaultPrevented).toBe(true);
		expect(innerCapture).toHaveBeenCalledTimes(3);
		expect(innerCapture).toHaveBeenLastCalledWith(afterSibling, form);
		expect(innerDeliveries.map(({ event, payload }) => [event, payload])).toEqual([
			[live, undefined],
			[afterOuter, undefined],
			[afterSibling, undefined],
		]);
		expect(outerCapture).not.toHaveBeenCalled();
		expect(outerDeliveries).toEqual([]);
	});

	it('preserves unrelated pending commands after the last configured root is disposed', async () => {
		const ownerDocument = earlyDocument();
		const unrelatedContainer = ownerDocument.createElement('main');
		unrelatedContainer.innerHTML =
			'<form data-octane-capture-submit="save"><input name="draft" value="accepted elsewhere"></form>';
		ownerDocument.body.appendChild(unrelatedContainer);
		const form = unrelatedContainer.querySelector('form')!;
		const original = submit(form);
		attach(ownerDocument.querySelector('main')!).dispose();
		unrelatedContainer.querySelector('input')!.value = 'edited';
		const deliveries: Delivery[] = [];
		const registration = registerSave(attach(unrelatedContainer), deliveries);
		await registration.ready;
		expect(original.defaultPrevented).toBe(true);
		expect(deliveries.map(({ event }) => event)).toEqual([original]);
		expect(deliveries[0].payload?.fields).toEqual([['draft', 'accepted elsewhere']]);
		const current = submit(form);
		expect(current.defaultPrevented).toBe(true);
		expect(deliveries.map(({ event }) => event)).toEqual([original, current]);
		expect(deliveries[1].payload?.fields).toEqual([['draft', 'edited']]);
	});

	it('drops accepted commands from a disposed default root before an opting replacement arrives', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const container = ownerDocument.querySelector('section')!;
		const outer = attach(ownerDocument.querySelector('main')!);
		const inner = attachWithoutForms(container);
		const historical = submit(form);
		outer.dispose();
		inner.dispose();
		ownerDocument.querySelector('textarea')!.value = 'current';
		const deliveries: Delivery[] = [];
		const capture = vi.fn(acceptedSubmission);
		await registerSave(attach(container), deliveries, { captureEvent: capture }).ready;
		expect(historical.defaultPrevented).toBe(true);
		expect(capture).not.toHaveBeenCalled();
		expect(deliveries).toEqual([]);
		const current = submit(form);
		expect(current.defaultPrevented).toBe(true);
		expect(capture).toHaveBeenCalledOnce();
		expect(deliveries.map(({ event }) => event)).toEqual([current]);
		expect(deliveries[0].payload?.fields).toEqual([['draft', 'current']]);
	});

	it.each(['default', 'configured'] as const)(
		'keeps accepted commands available after an already-aborted %s root with a configured sibling',
		async (mode) => {
			const ownerDocument = earlyDocument();
			const container = ownerDocument.querySelector('main')!;
			const form = ownerDocument.querySelector('form')!;
			attach(ownerDocument.querySelector('aside')!);
			const historical = submit(form);
			const lifetime = new ownerDocument.defaultView!.AbortController();
			lifetime.abort();
			const options = { signal: lifetime.signal };
			const canceled =
				mode === 'configured' ? attach(container, options) : attachWithoutForms(container, options);
			expect(canceled.signal.aborted).toBe(true);
			expect(() => canceled.dispose()).not.toThrow();
			expect(ownerDocument.querySelector('form')).toBe(form);
			ownerDocument.querySelector('textarea')!.value = 'current';
			const deliveries: Delivery[] = [];
			await registerSave(attach(container), deliveries).ready;
			expect(historical.defaultPrevented).toBe(true);
			expect(deliveries.map(({ event }) => event)).toEqual([historical]);
			expect(deliveries[0].payload?.fields).toEqual([['draft', 'accepted']]);
			const current = submit(form);
			expect(current.defaultPrevented).toBe(true);
			expect(deliveries.map(({ event }) => event)).toEqual([historical, current]);
			expect(deliveries[1].payload?.fields).toEqual([['draft', 'current']]);
		},
	);

	it.each(['unclaimed', 'captured'] as const)(
		'keeps the live owner %s command through an already-aborted configured replacement',
		async (phase) => {
			const ownerDocument = earlyDocument();
			const container = ownerDocument.querySelector('main')!;
			const form = ownerDocument.querySelector('form')!;
			const root = attach(container);
			const ready = deferred();
			const deliveries: Delivery[] = [];
			const capture = vi.fn(acceptedSubmission);
			let registration =
				phase === 'captured'
					? registerSave(root, deliveries, { ready: ready.promise, captureEvent: capture })
					: undefined;
			const original = submit(form);
			const lifetime = new ownerDocument.defaultView!.AbortController();
			lifetime.abort();
			const canceled = attach(container, { replace: true, signal: lifetime.signal });
			expect(canceled.signal.aborted).toBe(true);
			expect(root.signal.aborted).toBe(false);
			expect(() => canceled.dispose()).not.toThrow();
			expect(ownerDocument.querySelector('form')).toBe(form);
			ownerDocument.querySelector('textarea')!.value = 'current';
			registration ??= registerSave(root, deliveries, {
				ready: ready.promise,
				captureEvent: capture,
			});
			expect(original.defaultPrevented).toBe(true);
			expect(registration.signal.aborted).toBe(false);
			expect(capture).toHaveBeenCalledOnce();
			expect(capture.mock.calls[0][0]).toBe(original);
			expect(deliveries).toEqual([]);
			ready.resolve();
			await registration.ready;
			expect(deliveries.map(({ event }) => event)).toEqual([original]);
			expect(deliveries[0].payload?.fields).toEqual([['draft', 'accepted']]);
			const current = submit(form);
			expect(current.defaultPrevented).toBe(true);
			expect(capture).toHaveBeenCalledTimes(2);
			expect(deliveries.map(({ event }) => event)).toEqual([original, current]);
			expect(deliveries[1].payload?.fields).toEqual([['draft', 'current']]);
		},
	);

	it('delivers accepted fields and submitter once after later edits and registration', async () => {
		const ownerDocument = earlyDocument(
			'<main><form id="composer" action="/send" method="post" enctype="multipart/form-data" target="response" novalidate data-octane-capture-submit="save">' +
				'<textarea name="draft">accepted</textarea><input name="action" value="named control">' +
				'<input type="hidden" name="token" value="original"><input type="hidden" name="tag" value="first">' +
				'<input type="hidden" name="tag" value="second"><input type="checkbox" name="checked" value="yes" checked>' +
				'<input type="checkbox" name="unchecked" value="no"><input name="disabled" value="excluded" disabled>' +
				'<button id="send" type="submit" name="intent" value="send" formaction="/override" formmethod="get" formenctype="text/plain" formtarget="alternate" formnovalidate>Send</button>' +
				'</form><input form="composer" name="external" value="associated"></main>',
		);
		const form = ownerDocument.querySelector('form')!;
		const button = ownerDocument.querySelector('button')!;
		const event = submit(form, button);
		expect(event.defaultPrevented).toBe(true);
		ownerDocument.querySelector('textarea')!.value = 'edited';
		ownerDocument.querySelector<HTMLInputElement>('[name="token"]')!.value = 'changed';
		ownerDocument.querySelector<HTMLInputElement>('[name="checked"]')!.checked = false;
		ownerDocument.querySelector<HTMLInputElement>('[name="external"]')!.value = 'changed';
		button.value = 'changed';
		button.setAttribute('formaction', '/changed');
		form.action = '/changed';
		const ready = deferred();
		const deliveries: Delivery[] = [];
		const capture = vi.fn(acceptedSubmission);
		const registration = registerSave(attach(ownerDocument.querySelector('main')!), deliveries, {
			ready: ready.promise,
			captureEvent: capture,
		});
		expect(capture).toHaveBeenCalledOnce();
		expect(capture.mock.calls[0][0]).toBe(event);
		expect(deliveries).toEqual([]);
		ready.resolve();
		await registration.ready;
		expect(deliveries).toHaveLength(1);
		expect(deliveries[0].event).toBe(event);
		expect(deliveries[0].element).toBe(form);
		expect(deliveries[0].context.event).toBe(event);
		const snapshot = deliveries[0].payload!;
		expect(snapshot.fields).toEqual([
			['draft', 'accepted'],
			['action', 'named control'],
			['token', 'original'],
			['tag', 'first'],
			['tag', 'second'],
			['checked', 'yes'],
			['intent', 'send'],
			['external', 'associated'],
		]);
		expect(snapshot.form).toEqual({
			id: 'composer',
			action: 'https://example.test/send',
			method: 'post',
			enctype: 'multipart/form-data',
			target: 'response',
			noValidate: true,
		});
		expect(snapshot.submitter).toEqual({
			id: 'send',
			name: 'intent',
			value: 'send',
			type: 'submit',
			formAction: '/override',
			formMethod: 'get',
			formEnctype: 'text/plain',
			formTarget: 'alternate',
			formNoValidate: true,
		});
		expect(() => (snapshot.fields as [string, string][]).push(['late', 'edit'])).toThrow(TypeError);
		expect(() => ((snapshot.fields[0] as [string, string])[1] = 'edit')).toThrow(TypeError);
		expect(() => ((snapshot.form as { action: string }).action = '/edit')).toThrow(TypeError);
		expect(() => ((snapshot.submitter as { value: string }).value = 'edit')).toThrow(TypeError);
		expect(ownerDocument.querySelector('textarea')!.value).toBe('edited');
		expect(deliveries).toHaveLength(1);
	});

	it('waits for the exact external owner before adopting and delivering the command', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const root = attach(ownerDocument.querySelector('main')!);
		const owner = {};
		const ready = deferred();
		const range = root.registerExternalRange(ownerDocument.querySelector('section')!, {
			owner,
			ready: ready.promise,
		});
		const event = submit(form);
		const deliveries: Delivery[] = [];
		const adopt = vi.fn();
		const capture = vi.fn(acceptedSubmission);
		const registration = registerSave(root, deliveries, { owner, captureEvent: capture, adopt });
		expect(event.defaultPrevented).toBe(true);
		expect(capture).toHaveBeenCalledOnce();
		expect(adopt).not.toHaveBeenCalled();
		expect(deliveries).toEqual([]);
		ready.resolve();
		await Promise.all([range.ready, registration.ready]);
		expect(adopt).toHaveBeenCalledOnce();
		expect(deliveries).toHaveLength(1);
		expect(deliveries[0].event).toBe(event);
		expect(deliveries[0].context.range).toBe(range);
		expect(deliveries[0].payload?.fields).toEqual([['draft', 'accepted']]);
		expect(deliveries[0].payload?.submitter).toBeNull();
	});

	it.each(['identity', 'target', 'events', 'capture', 'owner'] as const)(
		'ignores and safely disposes a registration with the wrong %s',
		async (mismatch) => {
			const ownerDocument = earlyDocument();
			const form = ownerDocument.querySelector('form')!;
			const event = submit(form);
			const outer = attach(ownerDocument.querySelector('main')!);
			const section = ownerDocument.querySelector('section')!;
			const owner = {};
			outer.registerExternalRange(section, { owner });
			const wrongCapture = vi.fn(acceptedSubmission);
			const wrongDeliveries: Delivery[] = [];
			const wrongRegistration = registerSave(outer, wrongDeliveries, {
				id: mismatch === 'identity' ? 'other' : 'save',
				target: mismatch === 'target' ? 'aside' : form,
				events: mismatch === 'events' ? ['click'] : ['submit'],
				captureEvent: mismatch === 'capture' ? undefined : wrongCapture,
				owner: mismatch === 'owner' ? {} : owner,
			});
			expect(wrongCapture).not.toHaveBeenCalled();
			expect(wrongDeliveries).toEqual([]);
			wrongRegistration.dispose();
			const deliveries: Delivery[] = [];
			const registration = registerSave(attach(section), deliveries, { owner });
			await registration.ready;
			expect(event.defaultPrevented).toBe(true);
			expect(deliveries).toHaveLength(1);
			expect(deliveries[0].event).toBe(event);
			expect(deliveries[0].payload?.fields).toEqual([['draft', 'accepted']]);
			expect(wrongDeliveries).toEqual([]);
		},
	);

	it('preserves a form-root accepted command when a wrong-owner registration is disposed', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const root = attach(form);
		const owner = {};
		root.registerExternalRange(form, { owner });
		const original = submit(form);
		const wrongCapture = vi.fn(acceptedSubmission);
		const wrongDeliveries: Delivery[] = [];
		const wrongRegistration = registerSave(root, wrongDeliveries, {
			owner: {},
			captureEvent: wrongCapture,
		});
		await wrongRegistration.ready;
		expect(wrongCapture).not.toHaveBeenCalled();
		expect(wrongDeliveries).toEqual([]);
		wrongRegistration.dispose();
		ownerDocument.querySelector('textarea')!.value = 'edited';
		const ready = deferred();
		const deliveries: Delivery[] = [];
		const capture = vi.fn(acceptedSubmission);
		const registration = registerSave(root, deliveries, {
			owner,
			ready: ready.promise,
			captureEvent: capture,
		});
		expect(original.defaultPrevented).toBe(true);
		expect(capture).toHaveBeenCalledOnce();
		expect(capture.mock.calls[0][0]).toBe(original);
		expect(deliveries).toEqual([]);
		ready.resolve();
		await registration.ready;
		expect(deliveries.map(({ event }) => event)).toEqual([original]);
		expect(deliveries[0].payload?.fields).toEqual([['draft', 'accepted']]);
		const current = submit(form);
		expect(current.defaultPrevented).toBe(true);
		expect(deliveries.map(({ event }) => event)).toEqual([original, current]);
		expect(deliveries[1].payload?.fields).toEqual([['draft', 'edited']]);
		expect(wrongDeliveries).toEqual([]);
	});

	it('drops the accepted command after a pending external owner handoff', async () => {
		const ownerDocument = earlyDocument();
		const root = attach(ownerDocument.querySelector('main')!);
		const section = ownerDocument.querySelector('section')!;
		const ready = deferred();
		const owner = {};
		const range = root.registerExternalRange(section, { owner, ready: ready.promise });
		const event = submit(ownerDocument.querySelector('form')!);
		const deliveries: Delivery[] = [];
		const registration = registerSave(root, deliveries, { owner });
		root.registerExternalRange(section, { owner: {}, replace: true });
		ready.resolve();
		await registration.ready;
		expect(range.signal.aborted).toBe(true);
		expect(event.defaultPrevented).toBe(true);
		expect(deliveries).toEqual([]);
	});

	it('drops an unclaimed command when its known external range is replaced', async () => {
		const ownerDocument = earlyDocument();
		const root = attach(ownerDocument.querySelector('main')!);
		const section = ownerDocument.querySelector('section')!;
		const form = ownerDocument.querySelector('form')!;
		const ready = deferred();
		const previousRange = root.registerExternalRange(section, {
			owner: {},
			ready: ready.promise,
		});
		const previous = submit(form);
		const owner = {};
		root.registerExternalRange(section, { owner, replace: true });
		const deliveries: Delivery[] = [];
		const capture = vi.fn(acceptedSubmission);
		const registration = registerSave(root, deliveries, { owner, captureEvent: capture });
		ready.resolve();
		await registration.ready;
		expect(previous.defaultPrevented).toBe(true);
		expect(previousRange.signal.aborted).toBe(true);
		expect(capture).not.toHaveBeenCalled();
		expect(deliveries).toEqual([]);
		ownerDocument.querySelector('textarea')!.value = 'fresh';
		const current = submit(form);
		expect(current.defaultPrevented).toBe(true);
		expect(deliveries.map(({ event }) => event)).toEqual([current]);
		expect(deliveries[0].payload?.fields).toEqual([['draft', 'fresh']]);
	});

	it.each(['registration', 'root'] as const)(
		'preserves a nested owner pending commands and capture after outer %s disposal',
		async (lifecycle) => {
			const ownerDocument = earlyDocument();
			const form = ownerDocument.querySelector('form')!;
			const outer = attach(ownerDocument.querySelector('main')!);
			const inner = attach(ownerDocument.querySelector('section')!);
			const ready = deferred();
			const outerDeliveries: Delivery[] = [];
			const outerRegistration = registerSave(outer, outerDeliveries);
			const innerDeliveries: Delivery[] = [];
			const innerRegistration = registerSave(inner, innerDeliveries, { ready: ready.promise });
			const first = submit(form);
			if (lifecycle === 'registration') outerRegistration.dispose();
			else outer.dispose();
			ownerDocument.querySelector('textarea')!.value = 'second';
			const second = submit(form);
			expect(first.defaultPrevented).toBe(true);
			expect(second.defaultPrevented).toBe(true);
			expect(inner.signal.aborted).toBe(false);
			expect(innerRegistration.signal.aborted).toBe(false);
			expect(innerDeliveries).toEqual([]);
			ready.resolve();
			await innerRegistration.ready;
			expect(outerDeliveries).toEqual([]);
			expect(innerDeliveries.map(({ event }) => event)).toEqual([first, second]);
			expect(innerDeliveries.map(({ payload }) => payload?.fields)).toEqual([
				[['draft', 'accepted']],
				[['draft', 'second']],
			]);
		},
	);

	it('preserves a nested root unclaimed commands after the outer root is disposed', async () => {
		const ownerDocument = earlyDocument();
		const outer = attach(ownerDocument.querySelector('main')!);
		const inner = attach(ownerDocument.querySelector('section')!);
		const event = submit(ownerDocument.querySelector('form')!);
		outer.dispose();
		const deliveries: Delivery[] = [];
		const registration = registerSave(inner, deliveries);
		await registration.ready;
		expect(event.defaultPrevented).toBe(true);
		expect(inner.signal.aborted).toBe(false);
		expect(deliveries.map(({ event }) => event)).toEqual([event]);
		expect(deliveries[0].payload?.fields).toEqual([['draft', 'accepted']]);
	});

	it.each(['registration', 'root'] as const)(
		'holds commands for an attached child without behavior after outer %s disposal',
		async (lifecycle) => {
			const ownerDocument = earlyDocument();
			const form = ownerDocument.querySelector('form')!;
			const outer = attach(ownerDocument.querySelector('main')!);
			const outerDeliveries: Delivery[] = [];
			const outerCapture = vi.fn(acceptedSubmission);
			const outerRegistration = registerSave(outer, outerDeliveries, {
				captureEvent: outerCapture,
			});
			await outerRegistration.ready;
			const inner = attach(ownerDocument.querySelector('section')!);
			const original = submit(form);
			expect(original.defaultPrevented).toBe(true);
			expect(outerCapture).not.toHaveBeenCalled();
			expect(outerDeliveries).toEqual([]);
			ownerDocument.querySelector('textarea')!.value = 'edited';
			if (lifecycle === 'registration') outerRegistration.dispose();
			else outer.dispose();
			const ready = deferred();
			const innerDeliveries: Delivery[] = [];
			const innerCapture = vi.fn(acceptedSubmission);
			const innerRegistration = registerSave(inner, innerDeliveries, {
				ready: ready.promise,
				captureEvent: innerCapture,
			});
			expect(inner.signal.aborted).toBe(false);
			expect(innerCapture).toHaveBeenCalledOnce();
			expect(innerCapture.mock.calls[0][0]).toBe(original);
			expect(innerDeliveries).toEqual([]);
			ready.resolve();
			await innerRegistration.ready;
			expect(innerDeliveries.map(({ event }) => event)).toEqual([original]);
			expect(innerDeliveries[0].payload?.fields).toEqual([['draft', 'accepted']]);
			ownerDocument.querySelector('textarea')!.value = 'fresh';
			const current = submit(form);
			expect(current.defaultPrevented).toBe(true);
			expect(innerCapture).toHaveBeenCalledTimes(2);
			expect(innerDeliveries.map(({ event }) => event)).toEqual([original, current]);
			expect(innerDeliveries[1].payload?.fields).toEqual([['draft', 'fresh']]);
			expect(outerDeliveries).toEqual([]);
		},
	);

	it('does not transfer unclaimed commands with a subtree moved to another known root', async () => {
		const ownerDocument = earlyDocument();
		const sourceRoot = attach(ownerDocument.querySelector('main')!);
		const targetContainer = ownerDocument.createElement('main');
		ownerDocument.body.appendChild(targetContainer);
		const targetRoot = attach(targetContainer);
		const section = ownerDocument.querySelector('section')!;
		const form = ownerDocument.querySelector('form')!;
		const originalParent = form.parentElement;
		const previous = submit(form);
		targetContainer.appendChild(section);
		const deliveries: Delivery[] = [];
		const capture = vi.fn(acceptedSubmission);
		const registration = registerSave(targetRoot, deliveries, { captureEvent: capture });
		await registration.ready;
		expect(previous.defaultPrevented).toBe(true);
		expect(sourceRoot.signal.aborted).toBe(false);
		expect(form.parentElement).toBe(originalParent);
		expect(capture).not.toHaveBeenCalled();
		expect(deliveries).toEqual([]);
		ownerDocument.querySelector('textarea')!.value = 'fresh';
		const current = submit(form);
		expect(current.defaultPrevented).toBe(true);
		expect(deliveries.map(({ event }) => event)).toEqual([current]);
		expect(deliveries[0].payload?.fields).toEqual([['draft', 'fresh']]);
	});

	it.each(['registration disposal', 'registration abort', 'root disposal', 'root abort'] as const)(
		'releases native default and prevents late delivery after %s',
		async (lifecycle) => {
			const ownerDocument = earlyDocument();
			const form = ownerDocument.querySelector('form')!;
			const event = submit(form);
			const lifetime = new ownerDocument.defaultView!.AbortController();
			const root = attach(
				ownerDocument.querySelector('main')!,
				lifecycle === 'root abort' ? { signal: lifetime.signal } : {},
			);
			const ready = deferred();
			const deliveries: Delivery[] = [];
			const registration = registerSave(root, deliveries, {
				ready: ready.promise,
				...(lifecycle === 'registration abort' ? { signal: lifetime.signal } : {}),
			});
			if (lifecycle === 'registration disposal') registration.dispose();
			else if (lifecycle === 'root disposal') root.dispose();
			else lifetime.abort();
			ready.resolve();
			await registration.ready;
			expect(event.defaultPrevented).toBe(true);
			expect(registration.signal.aborted).toBe(true);
			expect(deliveries).toEqual([]);
			expect(submit(form).defaultPrevented).toBe(false);
		},
	);

	it.each(['moved', 'replaced', 'repurposed'] as const)(
		'drops an accepted command when the form is %s before delivery',
		async (change) => {
			const ownerDocument = earlyDocument();
			const form = ownerDocument.querySelector('form')!;
			const event = submit(form);
			const ready = deferred();
			const deliveries: Delivery[] = [];
			const registration = registerSave(attach(ownerDocument.querySelector('main')!), deliveries, {
				ready: ready.promise,
			});
			if (change === 'moved') ownerDocument.querySelector('aside')!.appendChild(form);
			else if (change === 'replaced') form.replaceWith(form.cloneNode(true));
			else form.setAttribute('data-octane-capture-submit', 'other');
			ready.resolve();
			await registration.ready;
			expect(event.defaultPrevented).toBe(true);
			expect(deliveries).toEqual([]);
		},
	);

	it('keeps accepted command order when capture synchronously submits another command', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const field = ownerDocument.querySelector('textarea')!;
		field.value = 'first';
		const first = submit(form);
		field.value = 'second';
		const second = submit(form);
		let nested: SubmitEvent | undefined;
		const captures: CapturedFormSubmission[] = [];
		const deliveries: Delivery[] = [];
		const registration = registerSave(attach(ownerDocument.querySelector('main')!), deliveries, {
			captureEvent(_event, _element, snapshot) {
				captures.push(snapshot!);
				if (snapshot!.fields[0][1] === 'first') {
					field.value = 'nested';
					nested = submit(form);
				}
				return snapshot;
			},
		});
		await registration.ready;
		expect([first, second, nested].map((event) => event!.defaultPrevented)).toEqual([
			true,
			true,
			true,
		]);
		expect(captures.map((snapshot) => snapshot.fields[0][1])).toEqual([
			'first',
			'second',
			'nested',
		]);
		expect(deliveries.map(({ event }) => event)).toEqual([first, second, nested]);
		expect(deliveries.map(({ payload }) => payload?.fields[0][1])).toEqual([
			'first',
			'second',
			'nested',
		]);
	});

	it('releases failed capture without delivering it to another registration', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const event = submit(form);
		const root = attach(ownerDocument.querySelector('main')!);
		const deliveries: Delivery[] = [];
		expect(() =>
			registerSave(root, deliveries, {
				captureEvent() {
					throw new Error('application capture failed');
				},
			}),
		).toThrow('application capture failed');
		const replacement = registerSave(root, deliveries);
		await replacement.ready;
		expect(event.defaultPrevented).toBe(true);
		expect(deliveries).toEqual([]);
		const next = submit(form);
		expect(next.defaultPrevented).toBe(false);
		expect(deliveries.map(({ event, payload }) => [event, payload])).toEqual([[next, undefined]]);
	});

	it('cannot deliver a command after capture reentrantly disposes its root', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const event = submit(form);
		const root = attach(ownerDocument.querySelector('main')!);
		const deliveries: Delivery[] = [];
		const registration = registerSave(root, deliveries, {
			captureEvent(_event, _element, snapshot) {
				root.dispose();
				return snapshot;
			},
		});
		await registration.ready;
		expect(event.defaultPrevented).toBe(true);
		expect(root.signal.aborted).toBe(true);
		expect(deliveries).toEqual([]);
		const replacement = registerSave(attach(ownerDocument.querySelector('main')!), deliveries);
		await replacement.ready;
		expect(deliveries).toEqual([]);
		expect(submit(form).defaultPrevented).toBe(false);
	});

	it.each(['main', 'form'] as const)(
		'releases unclaimed commands when their %s behavior root is disposed',
		async (target) => {
			const ownerDocument = earlyDocument();
			const form = ownerDocument.querySelector('form')!;
			const event = submit(form);
			const container = ownerDocument.querySelector(target)!;
			attach(container).dispose();
			const deliveries: Delivery[] = [];
			const registration = registerSave(attach(container), deliveries);
			await registration.ready;
			expect(event.defaultPrevented).toBe(true);
			expect(deliveries).toEqual([]);
			expect(submit(form).defaultPrevented).toBe(false);
		},
	);

	it('releases unclaimed commands when the document lifetime ends', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const event = submit(form);
		const ownerWindow = ownerDocument.defaultView!;
		ownerWindow.dispatchEvent(new ownerWindow.Event('pagehide'));
		const deliveries: Delivery[] = [];
		const registration = registerSave(attach(ownerDocument.querySelector('main')!), deliveries);
		await registration.ready;
		expect(event.defaultPrevented).toBe(true);
		expect(deliveries).toEqual([]);
		expect(submit(form).defaultPrevented).toBe(false);
	});

	it('drops a claimed accepted command after page exit while ordinary registration remains live', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const original = submit(form);
		const root = attach(ownerDocument.querySelector('main')!);
		const ready = deferred();
		const deliveries: Delivery[] = [];
		const capture = vi.fn(acceptedSubmission);
		const adopt = vi.fn();
		const registration = registerSave(root, deliveries, {
			ready: ready.promise,
			captureEvent: capture,
			adopt,
		});
		expect(original.defaultPrevented).toBe(true);
		expect(capture).toHaveBeenCalledOnce();
		expect(capture.mock.calls[0][0]).toBe(original);
		expect(capture.mock.calls[0][2]?.fields).toEqual([['draft', 'accepted']]);
		expect(adopt).not.toHaveBeenCalled();
		expect(deliveries).toEqual([]);
		const ownerWindow = ownerDocument.defaultView!;
		ownerWindow.dispatchEvent(new ownerWindow.Event('pagehide'));
		ready.resolve();
		await registration.ready;
		expect(deliveries).toEqual([]);
		expect(capture).toHaveBeenCalledOnce();
		expect(adopt).toHaveBeenCalledOnce();
		expect(adopt.mock.calls[0][0]).toBe(form);
		expect(adopt.mock.calls[0][1].event).toBeUndefined();
		expect(root.signal.aborted).toBe(false);
		expect(registration.signal.aborted).toBe(false);
	});

	it('releases unanswered forms after thirty seconds without stale delivery', async () => {
		vi.useFakeTimers();
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const first = submit(form);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(first.defaultPrevented).toBe(true);
		expect(submit(form).defaultPrevented).toBe(false);
		const deliveries: Delivery[] = [];
		const capture = vi.fn(acceptedSubmission);
		const registration = registerSave(attach(ownerDocument.querySelector('main')!), deliveries, {
			captureEvent: capture,
		});
		await registration.ready;
		expect(capture).not.toHaveBeenCalled();
		expect(deliveries).toEqual([]);
	});

	it('releases native default on overflow and never delivers abandoned commands', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		for (let index = 0; index < 256; index++) expect(submit(form).defaultPrevented).toBe(true);
		expect(submit(form).defaultPrevented).toBe(false);
		expect(submit(form).defaultPrevented).toBe(false);
		const deliveries: Delivery[] = [];
		const registration = registerSave(attach(ownerDocument.querySelector('main')!), deliveries);
		await registration.ready;
		expect(deliveries).toEqual([]);
	});

	it('routes identically named behavior owners within their own iframe documents', async () => {
		const firstDocument = earlyDocument();
		const secondDocument = earlyDocument();
		const firstForm = firstDocument.querySelector('form')!;
		const secondForm = secondDocument.querySelector('form')!;
		firstDocument.querySelector('textarea')!.value = 'first document';
		secondDocument.querySelector('textarea')!.value = 'second document';
		const first = submit(firstForm);
		const second = submit(secondForm);
		const firstDeliveries: Delivery[] = [];
		const secondDeliveries: Delivery[] = [];
		const firstRegistration = registerSave(
			attach(firstDocument.querySelector('main')!),
			firstDeliveries,
		);
		await firstRegistration.ready;
		expect(firstDeliveries.map(({ event }) => event)).toEqual([first]);
		expect(firstDeliveries[0].payload?.fields).toEqual([['draft', 'first document']]);
		expect(secondDeliveries).toEqual([]);
		const secondRegistration = registerSave(
			attach(secondDocument.querySelector('main')!),
			secondDeliveries,
		);
		await secondRegistration.ready;
		expect(secondDeliveries.map(({ event }) => event)).toEqual([second]);
		expect(secondDeliveries[0].payload?.fields).toEqual([['draft', 'second document']]);
		expect(first.defaultPrevented && second.defaultPrevented).toBe(true);
	});

	it.each(['form', 'bootstrap'] as const)(
		'keeps native default and ordinary registration without %s opt-in',
		async (optIn) => {
			const ownerDocument = earlyDocument(FORM, { formSubmissions: optIn !== 'bootstrap' });
			const form = ownerDocument.querySelector('form')!;
			if (optIn === 'form') form.removeAttribute('data-octane-capture-submit');
			const before = submit(form);
			const deliveries: Delivery[] = [];
			const registration = registerSave(attach(ownerDocument.querySelector('main')!), deliveries);
			await registration.ready;
			const live = submit(form);
			expect(before.defaultPrevented).toBe(false);
			expect(live.defaultPrevented).toBe(false);
			expect(deliveries.map(({ event, payload }) => [event, payload])).toEqual([[live, undefined]]);
		},
	);

	it('keeps click capture while each native submit delivers only one accepted command', async () => {
		const ownerDocument = earlyDocument();
		const form = ownerDocument.querySelector('form')!;
		const button = ownerDocument.querySelector('button')!;
		const root = attach(ownerDocument.querySelector('main')!);
		const ready = deferred();
		const clicks: Event[] = [];
		const submissions: Event[] = [];
		button.addEventListener('click', (event) => clicks.push(event));
		form.addEventListener('submit', (event) => submissions.push(event));
		const clickCapture = vi.fn((event: Event) => event.type);
		const clickDelivery = vi.fn();
		const clickRegistration = root.registerBehavior({
			target: button,
			events: ['click'],
			ready: ready.promise,
			captureEvent: clickCapture,
			adopt() {},
			handleEvent: clickDelivery,
		});
		const deliveries: Delivery[] = [];
		const registration = registerSave(root, deliveries, { ready: ready.promise });
		button.click();
		button.click();
		expect(submissions).toHaveLength(2);
		expect(submissions.every((event) => event.defaultPrevented)).toBe(true);
		expect(clickCapture).toHaveBeenCalledTimes(2);
		expect(clickDelivery).not.toHaveBeenCalled();
		expect(deliveries).toEqual([]);
		ready.resolve();
		await Promise.all([clickRegistration.ready, registration.ready]);
		expect(clickDelivery.mock.calls.map(([event]) => event)).toEqual(clicks);
		expect(deliveries.map(({ event }) => event)).toEqual(submissions);
		expect(deliveries.map(({ payload }) => payload?.fields)).toEqual([
			[
				['draft', 'accepted'],
				['intent', 'send'],
			],
			[
				['draft', 'accepted'],
				['intent', 'send'],
			],
		]);
		expect(submissions).toHaveLength(2);
	});
});
