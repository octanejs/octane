import { afterEach, expect, it } from 'vitest';
import { createStreamedRegionPlacementFrame, renderToString } from '../../src/server/index.js';
import { hydrateRoot, type Root } from '../../src/runtime.js';
import * as Signals from '../../src/signals/index.js';
import { createScope, runWithSignalOwner } from '../../src/signals/index.js';
import { createStreamedRegionReceiver } from '../../src/hydration/stream-receiver.js';
import type { StreamFrameIdentity } from '../../src/streamed-signals-protocol.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

let root: Root | undefined;
afterEach(() => {
	root?.unmount();
	root = undefined;
	document.body.textContent = '';
});

it.each([false, true])(
	'places real SSR and historical values, then preserves active ownership (dev=%s)',
	async (dev) => {
		const source = `import { signal$ } from 'octane/signals'; export const model$ = signal$('model', 'initial'); export function History() @{ const value = model$.get(); <><style>article { color: rgb(1, 2, 3); }</style><article><p>{value as string}</p><button onClick={() => model$.set('clicked')}>Update</button></article></> }`;
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
