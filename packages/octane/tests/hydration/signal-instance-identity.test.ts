import { describe, expect, it } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { componentSlot, createRoot, enableSignalBindings, type Scope } from '../../src/runtime.js';
import {
	enableServerSignalBindings,
	renderToString,
	ssrChild,
	ssrComponent,
	ssrHtml,
	ssrInputAttrs,
	ssrSignalControlAttrs,
	ssrSignalControlValue,
} from '../../src/runtime.server.js';
import {
	__signalAt,
	currentSignalOwner,
	installSignalOwnerEnvironment,
	runWithSignalOwner,
	type SignalOwner,
} from '../../src/signals/index.js';

function currentInstanceKey(): string {
	return (currentSignalOwner() as { instanceKey?: string } | null)?.instanceKey ?? 'missing';
}

describe('signal component instance identity', () => {
	it.each([false, true].flatMap((carrier) => [false, true].map((throws) => ({ carrier, throws }))))(
		'restores nested server ownership after a child returns or throws (%j)',
		({ carrier, throws }) => {
			enableServerSignalBindings();
			const storage = new AsyncLocalStorage<SignalOwner>();
			const restore = carrier
				? installSignalOwnerEnvironment({
						current: () => storage.getStore() ?? null,
						run: (owner, callback) => storage.run(owner, callback),
						capture: (owner) => (callback) => storage.run(owner, callback),
					})
				: undefined;
			const ambient = { scopeKey: 'ambient-server-owner' };
			const documentOwner = { scopeKey: 'rendered-server-owner' };
			const seen: Record<string, SignalOwner | null> = {};
			const Child = () => {
				seen.child = currentSignalOwner();
				if (throws) throw new Error('child failure');
				return 'child';
			};
			const Sibling = () => {
				seen.sibling = currentSignalOwner();
				return 'sibling';
			};
			const Parent = (_props: unknown, scope: any) => {
				seen.parent = currentSignalOwner();
				let child: string;
				try {
					child = ssrComponent(scope, Child, {}, false, undefined, false, 'c:child');
				} catch (error) {
					if ((error as Error).message !== 'child failure') throw error;
					child = 'caught';
				}
				seen.afterChild = currentSignalOwner();
				return child + ssrComponent(scope, Sibling, {}, false, undefined, false, 'c:sibling');
			};
			try {
				runWithSignalOwner(ambient, () => {
					const result = renderToString(Parent, {}, { signalOwner: documentOwner });
					expect(result.html).toContain(throws ? 'caught' : 'child');
					expect(result.html).toContain('sibling');
					expect(currentSignalOwner()).toBe(ambient);
					expect(() =>
						renderToString(
							() => {
								throw new Error('root failure');
							},
							{},
							{ signalOwner: documentOwner },
						),
					).toThrow('root failure');
					expect(currentSignalOwner()).toBe(ambient);
				});
				expect(seen.afterChild).toBe(seen.parent);
				expect(seen.child).not.toBe(seen.parent);
				expect(seen.sibling).not.toBe(seen.child);
				for (const owner of Object.values(seen)) {
					expect(owner).toMatchObject({ documentOwner });
				}
			} finally {
				restore?.();
			}
		},
	);

	it('strict-reads a generic child handle without compiler signal classification', () => {
		const value$ = __signalAt('g:server-child', 'server-child', 'server value');
		const ServerRoot = (_props: unknown, scope: any) => ssrChild(value$, scope);

		expect(renderToString(ServerRoot).html).toContain('server value');
	});

	it('serializes only the winning writable control identity', () => {
		enableServerSignalBindings();
		const draft$ = __signalAt('g:server-draft', 'server-draft', 'draft');
		const ServerRoot = () => {
			const control = ssrSignalControlValue(draft$, 'i:control');
			const sources = [
				[false, 'value', control] as const,
				[false, 'value', 'scalar winner'] as const,
			];
			return ssrHtml(
				'<input data-octane-input="i:control"' +
					ssrInputAttrs(sources) +
					ssrSignalControlAttrs(sources) +
					'/>',
			);
		};

		const html = renderToString(ServerRoot).html;
		expect(html).toContain('value="scalar winner"');
		expect(html).not.toContain('data-octane-signal-control="');
	});

	it('joins a winning writable control to its document-scoped signal node', () => {
		enableServerSignalBindings();
		const draft$ = __signalAt('g:joined-draft', 'joined-draft', 'draft');
		const ServerRoot = () => {
			const control = ssrSignalControlValue(draft$, 'i:control');
			const sources = [[false, 'value', control] as const];
			return ssrHtml(
				'<input data-octane-input="i:control"' +
					ssrInputAttrs(sources) +
					ssrSignalControlAttrs(sources) +
					'/>',
			);
		};

		const html = renderToString(ServerRoot).html;
		expect(html).toContain('data-octane-signal-control="');
		expect(html).toContain('joined-draft');
		expect(html).toContain('value="draft"');
	});

	it('does not shift a sibling when an SSR-only fallback is absent on the client', () => {
		enableServerSignalBindings();
		enableSignalBindings();
		const serverKeys: Record<string, string> = {};
		const clientKeys: Record<string, string> = {};
		const ServerFallback = () => {
			serverKeys.fallback = currentInstanceKey();
			return '';
		};
		const ServerSibling = () => {
			serverKeys.sibling = currentInstanceKey();
			return '';
		};
		const ServerRoot = (_props: unknown, scope: any) =>
			ssrComponent(scope, ServerFallback, {}, false, undefined, false, 'c:fallback') +
			ssrComponent(scope, ServerSibling, {}, false, undefined, false, 'c:sibling');
		renderToString(ServerRoot, {}, { identifierPrefix: 'structural-' });

		const ClientSibling = () => {
			clientKeys.sibling = currentInstanceKey();
		};
		const ClientRoot = (_props: unknown, scope: Scope) => {
			componentSlot(
				scope,
				1,
				scope.block.parentNode,
				ClientSibling,
				{},
				scope.block.endMarker,
				undefined,
				false,
				false,
				false,
				'c:sibling',
			);
		};
		const container = document.createElement('div');
		const root = createRoot(container, {
			identifierPrefix: 'structural-',
			signalInstancePrefix: 'structural-',
		});
		root.render(ClientRoot, {});

		expect(serverKeys.fallback).not.toBe(serverKeys.sibling);
		expect(clientKeys.sibling).toBe(serverKeys.sibling);
		root.unmount();
	});

	it('keeps repeated keyed call sites stable across opposite traversal order', () => {
		const serverKeys: Record<string, string> = {};
		const clientKeys: Record<string, string> = {};
		const ServerItem = (props: { id: string }) => {
			serverKeys[props.id] = currentInstanceKey();
			return '';
		};
		const ServerRoot = (_props: unknown, scope: any) =>
			['b', 'a']
				.map((id) => ssrComponent(scope, ServerItem, { id }, false, id, false, 'c:item'))
				.join('');
		renderToString(ServerRoot, {}, { identifierPrefix: 'keyed-' });

		const ClientItem = (props: { id: string }) => {
			clientKeys[props.id] = currentInstanceKey();
		};
		const ClientRoot = (_props: unknown, scope: Scope) => {
			for (const [slot, id] of ['a', 'b'].entries()) {
				componentSlot(
					scope,
					slot,
					scope.block.parentNode,
					ClientItem,
					{ id },
					scope.block.endMarker,
					id,
					false,
					false,
					true,
					'c:item',
				);
			}
		};
		const container = document.createElement('div');
		const root = createRoot(container, {
			identifierPrefix: 'keyed-',
			signalInstancePrefix: 'keyed-',
		});
		root.render(ClientRoot, {});

		expect(clientKeys).toEqual(serverKeys);
		expect(clientKeys.a).not.toBe(clientKeys.b);
		root.unmount();
	});
});
