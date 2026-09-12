import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { earlySignalBootstrapScript } from '../../src/server/early-signals.js';
import {
	applyHydrationControlCandidate,
	captureHydrationControlCandidate,
	consumeHydrationControl,
	initializeHydrationEventCapture,
	snapshotHydrationControl,
} from '../../src/hydration/event-capture.js';
import { bootstrapStreamedSignalHydration } from '../../src/hydration/streamed-signals.js';
import { registerSignalOwnerDocument } from '../../src/signals/early-values.js';
import {
	__derivedAt,
	__signalAt,
	bindSignalControl,
	createScope,
	runWithSignalOwner,
} from '../../src/signals/index.js';
import type { SignalRendererOwnerIdentity } from '../../src/signals/types.js';

describe('early hydration control handoff', () => {
	let input: HTMLInputElement;
	let cleanups: Array<() => void>;

	beforeEach(() => {
		cleanups = [];
		input = document.createElement('input');
		input.value = 'server';
		document.body.appendChild(input);
		initializeHydrationEventCapture(document);
	});

	afterEach(() => {
		for (const cleanup of cleanups.reverse()) cleanup();
		input.remove();
	});

	it('distinguishes an early clear from untouched server state', async () => {
		const untouched = snapshotHydrationControl(input)!;
		expect(untouched).toMatchObject({ value: 'server', editRevision: 0 });

		input.value = '';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));

		const edited = snapshotHydrationControl(input)!;
		expect(edited).toMatchObject({ value: '', editRevision: 1 });
		expect(edited.revision).toBeGreaterThan(untouched.revision);

		// Exercise the actual inline script before this document has any module
		// capture. Returning to the SSR value remains an edit, not untouched state.
		const earlyDocument = document.implementation.createHTMLDocument('Pre-module input');
		earlyDocument.head.innerHTML = earlySignalBootstrapScript();
		const earlyInput = earlyDocument.createElement('input');
		earlyInput.setAttribute(
			'data-octane-signal-control',
			JSON.stringify([1, 'early-revision-document', [['', 'draft', 'value']]]),
		);
		earlyInput.value = 'server';
		earlyDocument.body.append(earlyInput);
		const keys = [
			'__octaneEarlySignalControls',
			'__octanePublishSignalControl',
			'__octaneStreamedRenderer',
			'__octaneStreamedSignalSelections',
		];
		const previous = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
		try {
			for (const key of keys) Reflect.deleteProperty(globalThis, key);
			new Function(
				'document',
				'globalThis',
				earlyDocument.head.querySelector('script')!.textContent!,
			)(earlyDocument, globalThis);
			earlyInput.value = 'edited';
			earlyInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			earlyInput.value = 'server';
			earlyInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			vi.resetModules();
			const capture = await import('../../src/hydration/event-capture.js');
			const manualAdoption = capture.snapshotHydrationControl(earlyInput)!;
			expect(manualAdoption.editRevision).toBeGreaterThan(0);
			expect(capture.consumeHydrationControl(earlyInput, manualAdoption.revision)).toBe(true);
			earlyInput.value = 'edit after manual adoption';
			earlyInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			expect(capture.snapshotHydrationControl(earlyInput)?.editRevision).toBeGreaterThan(0);
			earlyInput.value = 'server';
			earlyInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			const candidate = capture.captureHydrationControlCandidate(earlyInput)!;
			expect(candidate.snapshot.value).toBe('server');
			expect(candidate.snapshot.editRevision).toBeGreaterThan(0);
			earlyInput.value = 'later edit';
			earlyInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			expect(capture.applyHydrationControlCandidate(candidate, { value: 'stored' })).toBe(false);
			const latest = capture.snapshotHydrationControl(earlyInput)!;
			expect(latest.editRevision).toBeGreaterThan(candidate.snapshot.editRevision);
			expect(capture.consumeHydrationControl(earlyInput, latest.revision)).toBe(true);
			expect(capture.snapshotHydrationControl(earlyInput)?.editRevision).toBe(0);
			earlyInput.value = 'edited after adoption';
			earlyInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			earlyInput.value = 'server';
			earlyInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			expect(capture.snapshotHydrationControl(earlyInput)?.revision).toBeGreaterThan(
				latest.revision,
			);
			expect(capture.applyHydrationControlCandidate(candidate, { value: 'obsolete' })).toBe(false);
			const signals = await import('../../src/signals/index.js');
			const earlyValues = await import('../../src/signals/early-values.js');
			const owner = { scopeKey: 'early-revision-document' };
			earlyValues.registerSignalOwnerDocument(owner, earlyDocument);
			const lateDraft$ = signals.__signalAt('g:draft', 'draft', 'default');
			expect(signals.runWithSignalOwner(owner, () => lateDraft$.get())).toBe('server');
			earlyInput.setAttribute(
				'data-octane-signal-control',
				JSON.stringify([1, owner.scopeKey, [['', 'shared-draft', 'value']]]),
			);
			const sibling = earlyInput.cloneNode() as HTMLInputElement;
			earlyDocument.body.append(sibling);
			earlyInput.value = 'older high revision';
			earlyInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			sibling.value = 'newer first edit';
			sibling.dispatchEvent(new InputEvent('input', { bubbles: true }));
			const sharedDraft$ = signals.__signalAt('g:shared-draft', 'shared-draft', 'default');
			expect(signals.runWithSignalOwner(owner, () => sharedDraft$.get())).toBe('newer first edit');
		} finally {
			keys.forEach((key, index) => {
				if (previous[index] === undefined) Reflect.deleteProperty(globalThis, key);
				else Object.defineProperty(globalThis, key, previous[index]!);
			});
		}
	});

	it('seeds the same global writable cell from an edit before its module resolves', () => {
		const documentOwner = Object.freeze({ scopeKey: 'early-document' });
		const owner: SignalRendererOwnerIdentity = Object.freeze({
			scopeKey: documentOwner.scopeKey,
			documentOwner,
			instanceOwner: {},
			instanceKey: 'root',
		});
		registerSignalOwnerDocument(owner, document);
		const hydration = bootstrapStreamedSignalHydration({
			buildId: 'early-control-build',
			documentId: 'early-control-response',
			signalOwner: documentOwner,
			initialSignals: {
				version: 1,
				scopes: [
					{
						version: 1,
						scopeKey: documentOwner.scopeKey,
						entries: [
							{ key: 'draft', kind: 'signal', value: ['string', 'server'], complete: true },
						],
					},
				],
			},
			target: { __octaneStreamedSignalSelections: { version: 1, identities: [], register() {} } },
		});
		cleanups.push(() => hydration.dispose());
		input.setAttribute(
			'data-octane-signal-control',
			JSON.stringify([1, documentOwner.scopeKey, [['', 'draft', 'value']]]),
		);
		input.value = '';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));

		const draft$ = __signalAt('g:draft', 'draft', 'server');
		expect(runWithSignalOwner(owner, () => draft$.get())).toBe('');
		const length$ = __derivedAt('g:length', 'length', () => draft$.get().length);
		const dispose = runWithSignalOwner(owner, () => bindSignalControl(input, 'value', draft$));
		cleanups.push(dispose);
		expect(() =>
			runWithSignalOwner(owner, () => bindSignalControl(input, 'value', draft$)),
		).toThrow(/already has a signal binding/);
		expect(input.value).toBe('');
		input.value = 'native edit';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		expect(runWithSignalOwner(owner, () => draft$.get())).toBe('native edit');
		expect(runWithSignalOwner(owner, () => length$.get())).toBe(11);
		runWithSignalOwner(owner, () => draft$.set('programmatic'));
		expect(input.value).toBe('programmatic');
		dispose();
		dispose();
		runWithSignalOwner(owner, () => draft$.set('after disposal'));
		expect(input.value).toBe('programmatic');
		input.value = 'unbound edit';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		expect(runWithSignalOwner(owner, () => draft$.get())).toBe('after disposal');
	});

	it('preserves live focus, selection, and composition state', () => {
		const scope = createScope({ scopeKey: 'composing-control' });
		cleanups.push(() => scope.dispose());
		const draft$ = scope.signal$('draft', 'server');
		cleanups.push(bindSignalControl(input, 'value', draft$));
		input.focus();
		input.setSelectionRange(1, 4, 'backward');
		document.dispatchEvent(new Event('selectionchange'));
		input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

		expect(snapshotHydrationControl(input)).toMatchObject({
			value: 'server',
			selectionStart: 1,
			selectionEnd: 4,
			selectionDirection: 'backward',
			focused: true,
			composing: true,
			selectionRevision: 1,
		});
		expect(consumeHydrationControl(input, snapshotHydrationControl(input)!.revision)).toBe(true);
		expect(snapshotHydrationControl(input)?.composing).toBe(true);
		draft$.set('late value during composition');
		expect(input.value).toBe('server');
		input.value = 'composed';
		input.setSelectionRange(2, 5, 'backward');
		input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
		expect(draft$.get()).toBe('composed');

		input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
		expect(snapshotHydrationControl(input)?.composing).toBe(false);
		expect(input).toBe(document.activeElement);
		expect(input.value).toBe('composed');
		expect(input.selectionStart).toBe(2);
		expect(input.selectionEnd).toBe(5);
		expect(input.selectionDirection).toBe('backward');
		draft$.set('composed');
		expect(input.selectionStart).toBe(2);
		expect(input.selectionEnd).toBe(5);
	});

	it('consumes only the exact snapshot revision adopted by the renderer', async () => {
		input.value = 'typed';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		const adopted = snapshotHydrationControl(input)!;

		input.value = 'typed again';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		expect(consumeHydrationControl(input, adopted.revision)).toBe(false);
		expect(snapshotHydrationControl(input)?.editRevision).toBe(2);

		const latest = snapshotHydrationControl(input)!;
		expect(consumeHydrationControl(input, latest.revision)).toBe(true);
		expect(snapshotHydrationControl(input)).toMatchObject({
			value: 'typed again',
			editRevision: 0,
		});

		const scope = createScope({ scopeKey: 'failed-control-binding' });
		cleanups.push(() => scope.dispose());
		const ready$ = scope.signal$('ready', false);
		const unavailable$ = scope.derived$('unavailable', () => {
			if (!ready$.get()) throw new Error('not ready');
			return 'recovered';
		});
		expect(() => bindSignalControl(input, 'value', unavailable$)).toThrow('not ready');
		ready$.set(true);
		expect(input.value).toBe('typed again');
		ready$.set(false);
		const pending$ = scope.derived$('pending', () => {
			if (!ready$.get()) throw Promise.resolve();
			return 'settled';
		});
		let suspension: unknown;
		try {
			bindSignalControl(input, 'value', pending$);
		} catch (error) {
			suspension = error;
		}
		expect(suspension).toBeInstanceOf(Promise);
		ready$.set(true);
		await suspension;
		expect(input.value).toBe('typed again');
		const draft$ = scope.signal$('after-failure', 'after failure');
		cleanups.push(bindSignalControl(input, 'value', draft$));
		expect(input.value).toBe('after failure');
	});

	it('rejects a storage candidate after an early clear', () => {
		const scope = createScope({ scopeKey: 'readonly-control' });
		cleanups.push(() => scope.dispose());
		const draft$ = scope.signal$('draft', 'server');
		const readonly$ = scope.derived$('readonly', () => draft$.get());
		input.value = 'early readonly edit';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		cleanups.push(bindSignalControl(input, 'value', readonly$));
		expect(input.value).toBe('server');
		expect(() => bindSignalControl(input, 'value', draft$)).toThrow(/already has a signal binding/);
		input.setAttribute('data-octane-input', 'i:draft');
		const candidate = captureHydrationControlCandidate(input)!;
		input.value = '';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));

		expect(applyHydrationControlCandidate(candidate, { value: 'stored' })).toBe(false);
		expect(input.value).toBe('');
		expect(snapshotHydrationControl(input)?.editRevision).toBe(2);
		expect(draft$.get()).toBe('server');
		draft$.set('author update');
		expect(input.value).toBe('author update');
	});

	it('applies an unchanged storage candidate as an authoritative early edit', () => {
		const scope = createScope({ scopeKey: 'candidate-control' });
		cleanups.push(() => scope.dispose());
		const draft$ = scope.signal$('draft', 'server');
		const length$ = scope.derived$('length', () => draft$.get().length);
		cleanups.push(bindSignalControl(input, 'value', draft$));
		input.setAttribute('data-octane-input', 'i:draft');
		const candidate = captureHydrationControlCandidate(input)!;

		expect(applyHydrationControlCandidate(candidate, { value: 'stored' })).toBe(true);
		expect(input.value).toBe('stored');
		expect(snapshotHydrationControl(input)?.editRevision).toBe(1);
		expect(applyHydrationControlCandidate(candidate, { value: 'older' })).toBe(false);
		expect(input.value).toBe('stored');
		expect(draft$.get()).toBe('stored');
		expect(length$.get()).toBe(6);

		const textarea = document.createElement('textarea');
		const select = document.createElement('select');
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		select.multiple = true;
		select.innerHTML = '<option value="a">A</option><option value="b">B</option>';
		document.body.append(textarea, select, checkbox);
		cleanups.push(
			() => textarea.remove(),
			() => select.remove(),
			() => checkbox.remove(),
		);
		const choices$ = scope.signal$('choices', ['a']);
		const checked$ = scope.signal$('checked', false);
		cleanups.push(
			bindSignalControl(textarea, 'value', draft$),
			bindSignalControl(select, 'value', choices$),
			bindSignalControl(checkbox, 'checked', checked$),
		);
		expect(textarea.value).toBe('stored');
		expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(['a']);
		select.options[1].selected = true;
		select.dispatchEvent(new Event('input', { bubbles: true }));
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('input', { bubbles: true }));
		expect(choices$.get()).toEqual(['a', 'b']);
		expect(checked$.get()).toBe(true);
		choices$.set(['b']);
		checked$.set(false);
		expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(['b']);
		expect(checkbox.checked).toBe(false);
	});
});
