import { describe, expect, it, vi } from 'vitest';
import { childSlot, createRoot, enableSignalBindings, type Scope } from '../../src/runtime.js';
import {
	bootstrapStreamedSignalHydration,
	bootstrapStreamedSignalResults,
} from '../../src/hydration/streamed-signals.js';
import {
	createScope,
	currentSignalOwner,
	derived$,
	installSignalOwnerEnvironment,
	retireSignalOwnerIdentity,
	runWithSignalOwner,
	signal$,
} from '../../src/signals/index.js';

describe('browser document signal ownership', () => {
	it('supports global writes before roots and from asynchronous callbacks without a scope', async () => {
		enableSignalBindings();
		expect(() =>
			bootstrapStreamedSignalHydration({
				buildId: 'document-owner-build',
				documentId: 'document-owner-response',
				initialSignals: {
					version: 1,
					scopes: [
						{
							version: 1,
							scopeKey: 'octane:document',
							entries: [
								{
									key: 'g:browser-document-draft',
									kind: 'signal',
									value: ['number', Infinity],
									complete: true,
								},
							],
						},
					],
				},
				target: { __octaneStreamedSignalSelections: { version: 1, identities: [], register() {} } },
			}),
		).toThrow();
		const failedOwner = { scopeKey: 'failed-initial-document' };
		expect(() =>
			bootstrapStreamedSignalHydration({
				buildId: 'document-owner-build',
				documentId: 'document-owner-response',
				signalOwner: failedOwner,
				initialSignals: { version: 1, scopes: [] },
				target: {
					__octaneStreamedSignalSelections: { version: 1, identities: [], register() {} },
					__octaneStreamedRenderer: { receive() {} },
				},
			}),
		).toThrow(/already installed/);
		expect(() =>
			runWithSignalOwner(failedOwner, () => signal$('', { key: 'g:failed-document' }).get()),
		).toThrow(/disposed/);
		const hydration = bootstrapStreamedSignalResults({
			buildId: 'document-owner-build',
			documentId: 'document-owner-response',
			initialSignals: {
				version: 1,
				scopes: [
					{
						version: 1,
						scopeKey: 'octane:document',
						entries: [
							{
								key: 'g:browser-document-draft',
								kind: 'signal',
								value: ['string', 'server'],
								complete: true,
							},
							{
								key: 'g:browser-document-length',
								kind: 'derived',
								value: ['number', 999],
								complete: true,
							},
						],
					},
					{
						version: 1,
						scopeKey: 'octane:document:instance:historical',
						entries: [
							{
								key: 'g:instance-only-seed',
								kind: 'signal',
								value: ['string', 'historical'],
								complete: true,
							},
						],
					},
				],
			},
			target: {
				__octaneStreamedSignalSelections: { version: 1, identities: [], register() {} },
			},
		});
		const draft$ = signal$('initial', { key: 'g:browser-document-draft' });
		expect(draft$.get()).toBe('server');
		const length$ = derived$(() => draft$.get().length, { key: 'g:browser-document-length' });
		expect(length$.get()).toBe(6);
		expect(signal$('live default', { key: 'g:instance-only-seed' }).get()).toBe('live default');
		await Promise.resolve().then(() => draft$.set('before roots'));
		expect(length$.get()).toBe(12);
		expect(() =>
			bootstrapStreamedSignalHydration({
				buildId: 'document-owner-build',
				documentId: 'document-owner-response',
				initialSignals: { version: 1, scopes: [] },
				target: { __octaneStreamedSignalSelections: { version: 1, identities: [], register() {} } },
			}),
		).toThrow(/already installed/);
		expect(draft$.get()).toBe('before roots');
		const containers = [document.createElement('div'), document.createElement('div')];
		document.body.append(...containers);
		const roots = containers.map((container) => createRoot(container));
		const Body = (_props: unknown, scope: Scope) =>
			childSlot(scope, 0, scope.block.parentNode, draft$);
		try {
			for (const root of roots) root.render(Body, {});
			expect(containers.map((container) => container.textContent)).toEqual([
				'before roots',
				'before roots',
			]);
			await Promise.resolve().then(() => draft$.set('async update'));
			await vi.waitFor(() =>
				expect(containers.map((container) => container.textContent)).toEqual([
					'async update',
					'async update',
				]),
			);
			roots[0]!.unmount();
			await Promise.resolve().then(() => draft$.set('still alive'));
			await vi.waitFor(() => expect(containers[1]!.textContent).toBe('still alive'));
			roots[1]!.unmount();
			expect(draft$.get()).toBe('still alive');
			hydration.dispose();
			expect(() =>
				bootstrapStreamedSignalHydration({
					buildId: 'document-owner-build',
					documentId: 'document-owner-response',
					initialSignals: { version: 1, scopes: [] },
					target: {
						__octaneStreamedSignalSelections: { version: 1, identities: [], register() {} },
					},
				}),
			).toThrow(/once, before any signal reads or writes/);
			expect(draft$.get()).toBe('still alive');
		} finally {
			hydration.dispose();
			for (const root of roots) root.unmount();
			for (const container of containers) container.remove();
		}
	});

	it('keeps explicit owners separate and does not fall back from a missing server request', () => {
		enableSignalBindings();
		const documentOwner = { scopeKey: 'descriptor-read-document' };
		const first = { scopeKey: 'first', documentOwner, instanceOwner: {}, instanceKey: 'first' };
		const second = { scopeKey: 'second', documentOwner, instanceOwner: {}, instanceKey: 'second' };
		const shared$ = signal$(1, { key: 'g:descriptor-read' });
		const local$ = signal$(1, { key: 'i:descriptor-read' });
		const uncompiled$ = signal$(0);
		try {
			expect(() => runWithSignalOwner(first, () => uncompiled$.get())).toThrow(/compiler/);
			runWithSignalOwner(first, () => local$.set(7));
			expect(runWithSignalOwner(second, () => local$.get())).toBe(1);
			const observed: number[] = [];
			const stop = runWithSignalOwner(first, () =>
				shared$.subscribe(() => {
					expect(currentSignalOwner()).toBe(first);
					observed.push(local$.get());
				}),
			);
			try {
				runWithSignalOwner(second, () => shared$.set(2));
				expect(observed).toEqual([7]);
			} finally {
				stop();
			}
			retireSignalOwnerIdentity(first);
			expect(() => runWithSignalOwner(first, () => local$.get())).toThrow(/disposed/);
			expect(runWithSignalOwner(second, () => shared$.get())).toBe(2);
		} finally {
			retireSignalOwnerIdentity(documentOwner);
		}
		expect(() => runWithSignalOwner(second, () => shared$.get())).toThrow(/disposed/);
		// Retirement still wins over a missing compiler site on the read path.
		expect(() => runWithSignalOwner(documentOwner, () => uncompiled$.get())).toThrow(/disposed/);
		const value$ = signal$('initial', { key: 'g:explicit-owner-priority' });
		value$.set('browser');
		const requestOwner = createScope({ scopeKey: 'request' });
		try {
			expect(runWithSignalOwner(requestOwner, () => value$.get())).toBe('initial');
			runWithSignalOwner(requestOwner, () => value$.set('request only'));
			expect(value$.get()).toBe('browser');
			const restore = installSignalOwnerEnvironment({
				current: () => null,
				run: (_owner, callback) => callback(),
				capture: () => (callback) => callback(),
			});
			try {
				expect(() => value$.get()).toThrow(/active signal owner/);
			} finally {
				restore();
			}
			expect(value$.get()).toBe('browser');
		} finally {
			requestOwner.dispose();
		}
	});

	it('does not revive retired document authority for a late global callback', async () => {
		enableSignalBindings();
		const value$ = signal$('initial', { key: 'g:retired-browser-document' });
		expect(value$.get()).toBe('initial');
		const owner = currentSignalOwner()!;
		retireSignalOwnerIdentity(owner);
		await expect(Promise.resolve().then(() => value$.set('obsolete'))).rejects.toThrow(
			/disposed|retired/i,
		);
	});
});
