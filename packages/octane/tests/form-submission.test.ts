import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	attachBehaviorRoot,
	type BehaviorContext,
	type BehaviorEntry,
	type BehaviorRoot,
	type CapturedFormSubmission,
} from 'octane';
import { earlySignalBootstrapScript, type EarlySignalBootstrapOptions } from 'octane/server';

type Delivery = {
	event: Event;
	element: Element;
	context: BehaviorContext;
	payload: CapturedFormSubmission | undefined;
};

const frames: HTMLIFrameElement[] = [];
const roots: BehaviorRoot[] = [];
const FORM =
	'<main><section><form id="composer" action="/send" data-octane-capture-submit="save">' +
	'<textarea name="draft">accepted</textarea><button type="submit" name="intent" value="send">Send</button>' +
	'</form></section><aside></aside></main>';

function earlyDocument(
	html = FORM,
	options: EarlySignalBootstrapOptions = { formSubmissions: true },
): Document {
	const frame = document.createElement('iframe');
	document.body.appendChild(frame);
	frames.push(frame);
	const ownerDocument = frame.contentDocument!;
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
	const root = attachBehaviorRoot(container, options);
	roots.push(root);
	return root;
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
	for (const root of roots.splice(0)) root.dispose();
	for (const frame of frames.splice(0)) {
		const ownerWindow = frame.contentDocument!.defaultView!;
		ownerWindow.dispatchEvent(new ownerWindow.Event('pagehide'));
		frame.remove();
	}
	vi.useRealTimers();
});

describe('parser-time native form commands', () => {
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
