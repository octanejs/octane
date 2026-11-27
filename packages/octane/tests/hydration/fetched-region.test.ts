import { afterEach, expect, it, onTestFinished, vi } from 'vitest';
import { createStreamedRegionPlacementFrame, renderToString } from '../../src/server/index.js';
import { flushSync, hydrateRoot, type Root } from '../../src/runtime.js';
import * as Signals from '../../src/signals/index.js';
import { createScope, runWithSignalOwner } from '../../src/signals/index.js';
import { createStreamedRegionReceiver } from '../../src/hydration/stream-receiver.js';
import { initializeHydrationEventCapture } from '../../src/hydration/index.js';
import type { StreamFrameIdentity } from '../../src/streamed-signals-protocol.js';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';
import { StreamedForm } from './_fixtures/fetched-region-form.tsrx';

let root: Root | undefined;
afterEach(() => {
	root?.unmount();
	root = undefined;
	document.body.textContent = '';
});

it.each([false, true])(
	'places real SSR and historical values, then preserves active ownership (dev=%s)',
	async (dev) => {
		const source = `import { signal$ } from 'octane/signals'; export const model$ = signal$('initial', { key: 'model' }); export function History() @{ const value = model$.get(); <><style>article { color: rgb(1, 2, 3); }</style><article><p>{value as string}</p><button onClick={() => model$.set('clicked')}>Update</button></article></> }`;
		const id = '/src/fetched-history.tsrx';
		const server = loadCompiledFixtureSource(source, {
			id,
			mode: 'server',
			compileOptions: { dev },
			runtimeModules: { 'octane/signals': Signals },
		});
		const client = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { dev },
			runtimeModules: { 'octane/signals': Signals },
		});
		const identity: StreamFrameIdentity = {
			protocol: 1,
			buildId: 'actual-fixture-build',
			documentId: 'document',
			ownerKey: 'history',
			instanceKey: 'history',
			nodeKey: 'model',
			selectionKey: 'A',
			selectionGeneration: 1,
			attempt: 0,
		};
		const serverOwner = createScope({ scopeKey: identity.ownerKey });
		runWithSignalOwner(serverOwner, () => server.model$.set('cached'));
		const rendered = renderToString(server.History, {}, { signalOwner: serverOwner });
		const frame = createStreamedRegionPlacementFrame(identity, rendered, {
			sequence: 0,
			contentRevision: 1,
		});
		serverOwner.dispose();
		const owner = createScope({ scopeKey: identity.ownerKey });
		runWithSignalOwner(owner, () => client.model$.set('newer live value'));
		const host = document.createElement('div');
		const start = document.createComment('[');
		const end = document.createComment(']');
		host.append(start, end);
		document.body.append(host);
		let active = false;
		const receiver = createStreamedRegionReceiver(identity);
		receiver.registerSelection(identity);
		receiver.attachResult(identity, {
			accept() {},
			fail(error) {
				throw error;
			},
		});
		receiver.registerRegion({
			identity,
			start,
			end,
			contentRevision: 0,
			isActive: () => active,
			loadStyles() {},
			adoptHistoricalFrame: (seed) => owner.beginAdoption(seed),
		});
		expect(await receiver.receive(frame)).toBe('accepted');
		expect(host.querySelector('p')?.textContent).toBe('cached');
		expect(host.querySelector('style')?.textContent).toContain('rgb(1, 2, 3)');
		const article = host.querySelector('article');
		active = true;
		start.remove();
		end.remove();
		root = hydrateRoot(host, client.History, {}, { signalOwner: owner });
		expect(host.querySelector('article')).toBe(article);
		await Promise.resolve();
		runWithSignalOwner(owner, () => client.model$.set('authoritative'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(host.querySelector('p')?.textContent).toBe('authoritative');
		expect(await receiver.receive({ ...frame, sequence: 1, contentRevision: 2 })).toBe('stale');
		expect(host.querySelector('article')).toBe(article);
		host.querySelector('button')!.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(host.querySelector('p')?.textContent).toBe('clicked');
		root.unmount();
		root = undefined;
		receiver.dispose();
		owner.dispose();
	},
);

it.each([
	['pristine', undefined],
	['edited', 'user draft'],
	['cleared', ''],
])('applies the latest streamed form attributes to %s controls', async (_mode, draft) => {
	const { StreamedForm: ServerForm } = loadServerFixture(
		'packages/octane/tests/hydration/_fixtures/fetched-region-form.tsrx',
		{
			compileOptions: { dev: process.env['OCTANE_TEST_COMPILE_MODE'] !== 'prod' },
			runtimeModules: { 'octane/signals': Signals },
		},
	);
	const identity: StreamFrameIdentity = {
		protocol: 1,
		buildId: 'fetched-form-build',
		documentId: 'document',
		ownerKey: 'form',
		instanceKey: 'form',
		nodeKey: 'draft',
		selectionKey: 'form',
		selectionGeneration: 1,
		attempt: 0,
	};
	const serverOwner = createScope({ scopeKey: identity.ownerKey });
	const owner = createScope({ scopeKey: identity.ownerKey });
	const receiver = createStreamedRegionReceiver(identity);
	onTestFinished(() => {
		receiver.dispose();
		serverOwner.dispose();
		owner.dispose();
	});
	const host = document.createElement('div');
	const start = document.createComment('[');
	const end = document.createComment(']');
	host.append(start, end);
	document.body.append(host);
	initializeHydrationEventCapture(document);
	let active = false;
	receiver.registerSelection(identity);
	receiver.registerRegion({
		identity,
		start,
		end,
		contentRevision: 0,
		isActive: () => active,
		loadStyles() {},
		adoptHistoricalFrame: (seed) => owner.beginAdoption(seed),
	});
	const place = (updated: boolean, sequence: number) => {
		const rendered = renderToString(ServerForm, { updated }, { signalOwner: serverOwner });
		return receiver.receive(
			createStreamedRegionPlacementFrame(identity, rendered, {
				sequence,
				contentRevision: sequence + 1,
			}),
		);
	};

	expect(await place(false, 0)).toBe('accepted');
	const blocked = host.querySelector<HTMLInputElement>('#draft')!;
	const editor = host.querySelector<HTMLInputElement>('#note')!;
	if (draft !== undefined) {
		for (const input of [blocked, editor]) {
			input.value = draft;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}
	editor.focus();
	const selectionEnd = draft === '' ? 0 : 4;
	editor.setSelectionRange(0, selectionEnd);

	expect(await place(true, 1)).toBe('accepted');
	const form = host.querySelector('form')!;
	expect(host.querySelector('#draft')).toBe(blocked);
	expect(host.querySelector('#note')).toBe(editor);
	expect(blocked).toMatchObject({
		disabled: true,
		name: 'blocked',
		placeholder: 'Unavailable',
		value: draft ?? 'server draft',
	});
	expect(blocked.hasAttribute('title')).toBe(false);
	expect(document.activeElement).toBe(editor);
	expect(editor).toMatchObject({ selectionStart: 0, selectionEnd });
	const fields = [['note', draft ?? 'server note']];
	expect([...new FormData(form)]).toEqual(fields);

	active = true;
	start.remove();
	end.remove();
	const props = { updated: true };
	const onRecoverableError = vi.fn();
	root = hydrateRoot(host, StreamedForm, props, { signalOwner: owner, onRecoverableError });
	flushSync(() => root!.render(StreamedForm, props));
	expect(onRecoverableError).not.toHaveBeenCalled();
	expect(host.querySelector('#draft')).toBe(blocked);
	expect(host.querySelector('#note')).toBe(editor);
	expect(blocked).toMatchObject({
		disabled: true,
		name: 'blocked',
		value: draft ?? 'server draft',
	});
	expect(document.activeElement).toBe(editor);
	expect(editor).toMatchObject({ selectionStart: 0, selectionEnd });
	expect([...new FormData(form)]).toEqual(fields);
});

it('submits the latest streamed default when the edited option was removed', async () => {
	const { StreamedChoice, choice$ } = loadServerFixture<
		typeof import('./_fixtures/fetched-region-form.tsrx')
	>('packages/octane/tests/hydration/_fixtures/fetched-region-form.tsrx', {
		compileOptions: { dev: process.env['OCTANE_TEST_COMPILE_MODE'] !== 'prod' },
		runtimeModules: { 'octane/signals': Signals },
	});
	const identity: StreamFrameIdentity = {
		protocol: 1,
		buildId: 'fetched-form-build',
		documentId: 'document',
		ownerKey: 'form',
		instanceKey: 'form',
		nodeKey: 'choice',
		selectionKey: 'form',
		selectionGeneration: 1,
		attempt: 0,
	};
	const serverOwner = createScope({ scopeKey: identity.ownerKey });
	const owner = createScope({ scopeKey: identity.ownerKey });
	const receiver = createStreamedRegionReceiver(identity);
	onTestFinished(() => {
		receiver.dispose();
		serverOwner.dispose();
		owner.dispose();
	});
	const host = document.createElement('div');
	const start = document.createComment('[');
	const end = document.createComment(']');
	host.append(start, end);
	document.body.append(host);
	receiver.registerSelection(identity);
	receiver.registerRegion({
		identity,
		start,
		end,
		contentRevision: 0,
		isActive: () => false,
		loadStyles() {},
		adoptHistoricalFrame: (seed) => owner.beginAdoption(seed),
	});
	const place = (sequence: number, options: string[], selection: string) => {
		runWithSignalOwner(serverOwner, () => choice$.set(selection));
		const rendered = renderToString(StreamedChoice, { options }, { signalOwner: serverOwner });
		return receiver.receive(
			createStreamedRegionPlacementFrame(identity, rendered, {
				sequence,
				contentRevision: sequence + 1,
			}),
		);
	};

	expect(await place(0, ['a', 'b'], 'a')).toBe('accepted');
	const choice = host.querySelector('select')!;
	const submittedChoice = () => new FormData(choice.form!).get('choice');
	choice.value = 'b';
	choice.dispatchEvent(new Event('input', { bubbles: true }));
	expect(submittedChoice()).toBe('b');

	expect(await place(1, ['c', 'd'], 'c')).toBe('accepted');
	expect(submittedChoice()).toBe('c');
	expect(await place(2, ['c', 'd'], 'd')).toBe('accepted');
	expect(host.querySelector('select')).toBe(choice);
	expect(submittedChoice()).toBe('d');
});

it('rejects a mismatched historical owner before producing private HTML', () => {
	const identity: StreamFrameIdentity = {
		protocol: 1,
		buildId: 'build',
		documentId: 'doc',
		ownerKey: 'owner',
		instanceKey: 'slot',
		nodeKey: 'model',
		selectionKey: 'A',
		selectionGeneration: 1,
		attempt: 0,
	};
	expect(() =>
		createStreamedRegionPlacementFrame(
			identity,
			{
				html: '<p>private</p>',
				css: '',
				signals: { version: 1, scopes: [{ version: 1, scopeKey: 'other', entries: [] }] },
			},
			{ sequence: 0, contentRevision: 1 },
		),
	).toThrow(/owner/i);
});
