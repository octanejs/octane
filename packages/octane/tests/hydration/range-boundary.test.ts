import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRuntime from 'octane/server';
import * as BehaviorRuntime from 'octane/behavior';
import { getLeadingHydrationListRange } from 'octane/hydration';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';
import {
	BoundaryClient,
	BoundaryFailingListClient,
	BoundaryFailingSuspenseClient,
	BoundaryListClient,
	BoundaryNestedListClient,
	BoundaryPendingHeadClient,
	BoundarySuspendingListClient,
} from './_fixtures/range-boundary.tsrx';

const fixture = join(import.meta.dirname, '_fixtures/range-boundary.tsrx');
const server = loadServerFixture(fixture);

function listSource(wrapped: boolean): string {
	return `
import { unbound } from 'octane/behavior';
import type { OctaneNode } from 'octane';
interface HostProps { children?: OctaneNode }
interface Row { id: string; label: string }
interface ListProps { rows: Row[]; showFooter: boolean; onAction?: () => void }
function PassThrough(props: HostProps) { return props.children; }
export function ListHost(props: HostProps) @{
	'use dom bindings';
	<ol class="rows">{unbound(props.children)}</ol>
}
export function ListView(props: ListProps) @{
	${wrapped ? '' : "'use dom bindings';"}
	${wrapped ? '<ListHost>' : '<ol class="rows">'}
		${wrapped ? '<PassThrough>' : ''}
		@for (const item of props.rows; key item.id) {
			<li data-row={item.id}>
				<button type="button" onClick={props.onAction}>{item.label as string}</button>
			</li>
		}
		@for (const anchor of props.showFooter ? ['footer'] : []; key anchor) {
			<li data-trailing-anchor="" aria-hidden="true" />
		}
		${wrapped ? '</PassThrough>' : ''}
	${wrapped ? '</ListHost>' : '</ol>'}
}
`;
}

let container: HTMLDivElement;
let portalTarget: HTMLDivElement;
beforeEach(() => {
	container = document.createElement('div');
	portalTarget = document.createElement('div');
	document.body.append(container, portalTarget);
});
afterEach(() => {
	container.remove();
	portalTarget.remove();
});

describe('hydration range boundary', () => {
	it('hydrates the owned body between siblings rendered into portals', () => {
		container.innerHTML = ServerRuntime.renderToString(server.ServerListSelection).html;
		const style = document.createElement('style');
		style.setAttribute('data-octane', '');
		container.append(style);
		const button = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
		expect(button).not.toBeNull();

		const errors: unknown[] = [];
		const root = hydrateRoot(
			container,
			BoundaryListClient,
			{ portalTarget },
			{ onRecoverableError: (error) => errors.push(error) },
		);
		flushSync(() => {});
		expect(errors).toEqual([]);
		expect([...container.querySelectorAll('#range-boundary-counter')]).toEqual([button]);
		expect(portalTarget.querySelector('#range-boundary-portal')?.textContent).toBe('portal');
		expect(portalTarget.querySelector('#range-boundary-portal-after')?.textContent).toBe('after');
		flushSync(() => button.click());
		expect(button.textContent?.trim()).toBe('count 1');

		flushSync(() => root.render(BoundaryListClient, { portalTarget }));
		expect([...container.querySelectorAll('#range-boundary-counter')]).toEqual([button]);
		expect(button.textContent?.trim()).toBe('count 1');
		expect(portalTarget.querySelector('#range-boundary-portal')?.textContent).toBe('portal');
		expect(portalTarget.querySelector('#range-boundary-portal-after')?.textContent).toBe('after');

		flushSync(() =>
			root.render(BoundaryListClient, { portalTarget, order: ['after', 'body', 'head'] }),
		);
		expect([...container.querySelectorAll('#range-boundary-counter')]).toEqual([button]);
		expect(button.textContent?.trim()).toBe('count 1');
		flushSync(() => root.render(BoundaryListClient, { portalTarget, order: ['head', 'after'] }));
		expect(container.querySelector('#range-boundary-counter')).toBeNull();
		expect(portalTarget.querySelector('#range-boundary-portal')?.textContent).toBe('portal');
		expect(portalTarget.querySelector('#range-boundary-portal-after')?.textContent).toBe('after');
		flushSync(() => root.render(BoundaryListClient, { portalTarget }));
		const restored = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
		expect(restored).not.toBeNull();
		expect(restored).not.toBe(button);
		flushSync(() => restored.click());
		expect(restored.textContent?.trim()).toBe('count 1');
		flushSync(() => root.render(BoundaryListClient, { portalTarget, order: [] }));
		expect(container.querySelector('#range-boundary-counter')).toBeNull();
		expect(container.contains(style)).toBe(true);
		expect(portalTarget.textContent).toBe('');
		flushSync(() => root.render(BoundaryListClient, { portalTarget }));
		expect(container.querySelector('#range-boundary-counter')).not.toBeNull();
		expect(container.contains(style)).toBe(true);
		root.unmount();
		expect(container.querySelector('#range-boundary-counter')).toBeNull();
		expect(portalTarget.querySelector('#range-boundary-portal')).toBeNull();
		expect(portalTarget.querySelector('#range-boundary-portal-after')).toBeNull();
	});

	it('keeps portal siblings movable after replacing mismatched server content', () => {
		container.innerHTML = ServerRuntime.renderToString(server.ServerListSelection).html;
		container.querySelector('#range-boundary-counter')!.outerHTML = '<em id="stale">stale</em>';
		const root = hydrateRoot(container, BoundaryListClient, { portalTarget });
		const replacement = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
		expect(replacement).not.toBeNull();
		expect(container.querySelector('#stale')).toBeNull();
		flushSync(() => replacement.click());
		expect(replacement.textContent?.trim()).toBe('count 1');

		flushSync(() => root.render(BoundaryListClient, { portalTarget, order: ['head', 'after'] }));
		flushSync(() => root.render(BoundaryListClient, { portalTarget, order: ['after', 'head'] }));
		expect(container.querySelector('#range-boundary-counter')).toBeNull();
		expect(portalTarget.querySelector('#range-boundary-portal')?.textContent).toBe('portal');
		expect(portalTarget.querySelector('#range-boundary-portal-after')?.textContent).toBe('after');
		root.unmount();
		expect(portalTarget.textContent).toBe('');
	});

	it('keeps a multi-root owner and renderer style intact through list updates', () => {
		container.innerHTML = ServerRuntime.renderToString(server.ServerPairSelection).html;
		const button = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
		const extra = container.querySelector('#range-boundary-extra');
		const style = document.createElement('style');
		style.setAttribute('data-octane', '');
		container.append(style);
		const root = hydrateRoot(container, BoundaryListClient, { portalTarget, pair: true });
		expect(container.querySelector('#range-boundary-counter')).toBe(button);
		expect(container.querySelector('#range-boundary-extra')).toBe(extra);
		flushSync(() => button.click());
		expect(button.textContent?.trim()).toBe('count 1');
		flushSync(() =>
			root.render(BoundaryListClient, {
				portalTarget,
				pair: true,
				order: ['after', 'body', 'head'],
			}),
		);
		expect(container.querySelector('#range-boundary-counter')).toBe(button);
		expect(container.querySelector('#range-boundary-extra')).toBe(extra);
		flushSync(() => root.render(BoundaryListClient, { portalTarget, pair: true, order: [] }));
		expect(container.querySelector('#range-boundary-counter')).toBeNull();
		expect(container.querySelector('#range-boundary-extra')).toBeNull();
		expect(container.contains(style)).toBe(true);
		flushSync(() => root.render(BoundaryListClient, { portalTarget, pair: true }));
		expect(container.querySelector('#range-boundary-counter')).not.toBeNull();
		expect(container.querySelector('#range-boundary-extra')).not.toBeNull();
		expect(container.contains(style)).toBe(true);
		root.unmount();
		expect(portalTarget.textContent).toBe('');
	});

	for (const withStyle of [false, true]) {
		it(`keeps a new owner inside its list when server content is empty${withStyle ? ' with a renderer style' : ''}`, () => {
			const style = document.createElement('style');
			style.setAttribute('data-octane', '');
			if (withStyle) container.append(style);
			const root = hydrateRoot(container, BoundaryListClient, { portalTarget });
			const button = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
			expect(button).not.toBeNull();
			flushSync(() => button.click());
			expect(button.textContent?.trim()).toBe('count 1');
			flushSync(() => root.render(BoundaryListClient, { portalTarget, order: ['head', 'after'] }));
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			flushSync(() => root.render(BoundaryListClient, { portalTarget }));
			expect(container.querySelectorAll('#range-boundary-counter')).toHaveLength(1);
			flushSync(() => root.render(BoundaryListClient, { portalTarget, order: [] }));
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			if (withStyle) expect(container.contains(style)).toBe(true);
			expect(portalTarget.textContent).toBe('');
			root.unmount();
		});
	}

	for (const renderServer of [false, true]) {
		it(`keeps nested sibling ranges contained ${renderServer ? 'after hydration' : 'when server content is empty'}`, () => {
			container.innerHTML = renderServer
				? ServerRuntime.renderToString(server.ServerListSelection).html
				: '';
			const original = container.querySelector('#range-boundary-counter');
			const style = document.createElement('style');
			style.setAttribute('data-octane', '');
			container.append(style);
			const root = hydrateRoot(container, BoundaryNestedListClient, { portalTarget });
			const button = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
			expect(button).not.toBeNull();
			if (renderServer) expect(button).toBe(original);
			flushSync(() => button.click());
			expect(button.textContent?.trim()).toBe('count 1');
			flushSync(() =>
				root.render(BoundaryNestedListClient, {
					portalTarget,
					outer: ['t', 'middle', 'h'],
					inner: ['b', 'body', 'a'],
				}),
			);
			expect(container.querySelector('#range-boundary-counter')).toBe(button);
			flushSync(() => root.render(BoundaryNestedListClient, { portalTarget, inner: ['a', 'b'] }));
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			flushSync(() => root.render(BoundaryNestedListClient, { portalTarget }));
			expect(container.querySelectorAll('#range-boundary-counter')).toHaveLength(1);
			flushSync(() => root.render(BoundaryNestedListClient, { portalTarget, outer: ['h', 't'] }));
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			flushSync(() => root.render(BoundaryNestedListClient, { portalTarget }));
			expect(container.querySelectorAll('#range-boundary-counter')).toHaveLength(1);
			flushSync(() => root.render(BoundaryNestedListClient, { portalTarget, outer: [] }));
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			expect(portalTarget.textContent).toBe('');
			expect(container.contains(style)).toBe(true);
			root.unmount();
		});
	}

	for (const wrapped of [false, true]) {
		it(`retries a later suspended sibling without replacing server content (${wrapped ? 'within Suspense' : 'at the root'})`, async () => {
			container.innerHTML = ServerRuntime.renderToString(server.ServerListSelection).html;
			const button = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
			let resolve!: () => void;
			const deferred = {
				ready: false,
				promise: new Promise<void>((done) => {
					resolve = done;
				}),
			};
			const errors: unknown[] = [];
			const client = wrapped ? BoundarySuspendingListClient : BoundaryListClient;
			const root = hydrateRoot(
				container,
				client,
				{ portalTarget, deferred },
				{
					onRecoverableError: (error) => errors.push(error),
				},
			);
			expect([...container.querySelectorAll('#range-boundary-counter')]).toEqual([button]);
			expect(portalTarget.textContent).toBe('');

			await act(() => {
				deferred.ready = true;
				resolve();
			});
			expect([...container.querySelectorAll('#range-boundary-counter')]).toEqual([button]);
			expect(portalTarget.querySelector('#range-boundary-portal')?.textContent).toBe('portal');
			expect(portalTarget.querySelector('#range-boundary-portal-after')?.textContent).toBe('after');
			flushSync(() => button.click());
			expect(button.textContent?.trim()).toBe('count 1');
			expect(errors).toEqual([]);
			root.unmount();
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			expect(portalTarget.textContent).toBe('');
		});
	}

	it('shows a pending head fallback while hydrating an independent body owner', async () => {
		container.innerHTML = ServerRuntime.renderToString(server.ServerListSelection).html;
		const button = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
		let resolve!: () => void;
		const deferred = {
			ready: false,
			promise: new Promise<void>((done) => {
				resolve = done;
			}),
		};
		const errors: unknown[] = [];
		const root = hydrateRoot(
			container,
			BoundaryPendingHeadClient,
			{ portalTarget, deferred },
			{
				onRecoverableError: (error) => errors.push(error),
			},
		);
		expect(portalTarget.querySelector('#range-boundary-head-pending')?.textContent).toBe('pending');
		expect([...container.querySelectorAll('#range-boundary-counter')]).toEqual([button]);
		flushSync(() => button.click());
		expect(button.textContent?.trim()).toBe('count 1');

		await act(() => {
			deferred.ready = true;
			resolve();
		});
		expect(portalTarget.querySelector('#range-boundary-head-pending')).toBeNull();
		expect(portalTarget.querySelector('#range-boundary-portal')?.textContent).toBe('portal');
		expect([...container.querySelectorAll('#range-boundary-counter')]).toEqual([button]);
		flushSync(() => button.click());
		expect(button.textContent?.trim()).toBe('count 2');
		expect(errors).toEqual([]);
		root.unmount();
		expect(container.querySelector('#range-boundary-counter')).toBeNull();
		expect(portalTarget.textContent).toBe('');
	});

	for (const failOwner of [false, true]) {
		it(`replaces server content with an error fallback when ${failOwner ? 'the owner' : 'a later sibling'} throws`, async () => {
			container.innerHTML = ServerRuntime.renderToString(server.ServerListSelection).html;
			const style = document.createElement('style');
			style.setAttribute('data-octane', '');
			container.append(style);
			const caught: unknown[] = [];
			const root = hydrateRoot(
				container,
				BoundaryFailingListClient,
				{
					portalTarget,
					failOwner,
					deferred: { failed: !failOwner, ready: true, promise: Promise.resolve() },
				},
				{ onCaughtError: (error) => caught.push(error) },
			);
			await act(() => {});
			expect(caught).toHaveLength(1);
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			expect(container.querySelector('#range-boundary-error')?.textContent).toBe('failed');
			expect(container.contains(style)).toBe(true);
			expect(portalTarget.textContent).toBe('');
			root.unmount();
			expect(container.querySelector('#range-boundary-error')).toBeNull();
			expect(portalTarget.textContent).toBe('');
		});
	}

	for (const failAfterOwner of [false, true]) {
		it(`retains server content while an error fallback suspends after ${failAfterOwner ? 'partial owner adoption' : 'the owner'}`, async () => {
			container.innerHTML = ServerRuntime.renderToString(
				failAfterOwner ? server.ServerPartialOwner : server.ServerListSelection,
			).html;
			const button = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
			const style = document.createElement('style');
			style.setAttribute('data-octane', '');
			container.append(style);
			let resolve!: () => void;
			const fallbackDeferred = {
				ready: false,
				promise: new Promise<void>((done) => {
					resolve = done;
				}),
			};
			const root = hydrateRoot(
				container,
				BoundaryFailingSuspenseClient,
				{
					portalTarget,
					fallbackDeferred,
					failAfterOwner,
					deferred: { failed: !failAfterOwner, ready: true, promise: Promise.resolve() },
				},
				{ onCaughtError: () => {} },
			);
			expect([...container.querySelectorAll('#range-boundary-counter')]).toEqual([button]);
			expect(container.contains(style)).toBe(true);
			expect(container.querySelector('#range-boundary-error')).toBeNull();
			await act(() => {
				fallbackDeferred.ready = true;
				resolve();
			});
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			expect(container.querySelector('#range-boundary-error')?.textContent).toBe('failed');
			expect(container.contains(style)).toBe(true);
			expect(portalTarget.textContent).toBe('');
			root.unmount();
			expect(container.querySelector('#range-boundary-error')).toBeNull();
		});
	}

	it('retains wrappers and portals outside the selected server range', () => {
		container.innerHTML = ServerRuntime.renderToString(server.ServerSelection).html;
		const button = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const root = hydrateRoot(container, BoundaryClient, {
				enabled: true,
				portalTarget,
			});
			flushSync(() => {});
			expect(error).not.toHaveBeenCalled();
			expect(container.querySelector('#range-boundary-counter')).toBe(button);
			expect(portalTarget.querySelectorAll('#range-boundary-portal')).toHaveLength(1);
			flushSync(() => button.click());
			expect(button.textContent?.trim()).toBe('count 1');
			root.unmount();
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			expect(portalTarget.querySelector('#range-boundary-portal')).toBeNull();
		} finally {
			error.mockRestore();
		}
	});

	for (const dev of [false, true]) {
		for (const wrapped of [false, true]) {
			it(`discovers only complete leading lists and preserves prepared rows through hydration (${dev ? 'dev' : 'prod'}, ${wrapped ? 'wrapped' : 'direct'})`, () => {
				const source = listSource(wrapped);
				const options = {
					id: `/hydration/rows-${wrapped}.tsrx`,
					compileOptions: { strong: true, dev, hmr: false },
					runtimeModules: { 'octane/behavior': BehaviorRuntime },
				};
				const serverList = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
				const clientList = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
				for (const populated of [false, true]) {
					const rows = populated ? [{ id: 'entry', label: 'Entry' }] : [];
					const props = { rows, showFooter: true };
					const html = ServerRuntime.renderToString(serverList.ListView, props).html;
					container.innerHTML = html;
					const host = container.querySelector('ol')!;
					const entry = host.querySelector('[data-row="entry"]');
					const anchor = host.querySelector('[data-trailing-anchor]');
					const range = getLeadingHydrationListRange(host);
					expect(range, `leading list: dev=${dev}, wrapped=${wrapped}`).not.toBeNull();
					const blocked = host.cloneNode(true) as Element;
					blocked.prepend(document.createTextNode('Authored content'));
					expect(getLeadingHydrationListRange(blocked)).toBeNull();
					const descendant = document.createElement('div');
					descendant.append(host.cloneNode(true));
					expect(getLeadingHydrationListRange(descendant)).toBeNull();
					const malformed = host.cloneNode(true) as Element;
					getLeadingHydrationListRange(malformed)!.start.data = '[f9';
					expect(getLeadingHydrationListRange(malformed)).toBeNull();
					const missingClose = host.cloneNode(true) as Element;
					getLeadingHydrationListRange(missingClose)!.end.remove();
					expect(getLeadingHydrationListRange(missingClose)).toBeNull();
					const mismatchedList = host.cloneNode(true) as Element;
					const listClose = getLeadingHydrationListRange(mismatchedList)!.end;
					const originalListClose = listClose.data;
					listClose.data += '2';
					expect(getLeadingHydrationListRange(mismatchedList)).toBeNull();
					listClose.data = originalListClose;
					expect(getLeadingHydrationListRange(mismatchedList)).not.toBeNull();
					if (!wrapped && populated) {
						const typedBoundary = host.cloneNode(true) as Element;
						typedBoundary.prepend(range!.start.nextSibling!.cloneNode());
						expect(getLeadingHydrationListRange(typedBoundary)).toBeNull();
					}
					if (wrapped && host.firstChild !== range!.start) {
						const malformedWrapper = host.cloneNode(true) as Element;
						(malformedWrapper.firstChild as Comment).data = '[01';
						expect(getLeadingHydrationListRange(malformedWrapper)).toBeNull();
						const missingWrapperClose = host.cloneNode(true) as Element;
						missingWrapperClose.lastChild!.remove();
						expect(getLeadingHydrationListRange(missingWrapperClose)).toBeNull();
						const mismatchedWrapper = host.cloneNode(true) as Element;
						const wrapperClose = mismatchedWrapper.lastChild as Comment;
						const originalClose = wrapperClose.data;
						wrapperClose.data += '2';
						expect(getLeadingHydrationListRange(mismatchedWrapper)).toBeNull();
						wrapperClose.data = originalClose;
						expect(getLeadingHydrationListRange(mismatchedWrapper)).not.toBeNull();
					}
					const prepared = { id: 'prepared', label: 'Action' };
					function preparedNodes(): Node[] {
						const template = document.createElement('template');
						template.innerHTML = ServerRuntime.renderToString(serverList.ListView, {
							rows: [prepared],
							showFooter: false,
						}).html;
						const preparedRange = getLeadingHydrationListRange(
							template.content.querySelector('ol')!,
						)!;
						const nodes: Node[] = [];
						for (
							let node = preparedRange.start.nextSibling;
							node !== null && node !== preparedRange.end;
							node = node.nextSibling
						) {
							nodes.push(node);
						}
						return nodes;
					}
					const inserted = preparedNodes();
					const preparedRow = inserted.find((node) => node.nodeType === 1)! as HTMLLIElement;
					const actionButton = preparedRow.querySelector('button')!;
					range!.start.data = range!.itemsMarker;
					range!.end.before(...inserted);
					const action = vi.fn();
					const errors: unknown[] = [];
					const root = hydrateRoot(
						container,
						clientList.ListView,
						{ ...props, rows: [...rows, prepared], onAction: action },
						{ onRecoverableError: (error) => errors.push(error) },
					);
					flushSync(() => {});
					expect(errors).toEqual([]);
					expect(container.querySelector('ol')).toBe(host);
					expect(host.querySelector('[data-row="entry"]')).toBe(entry);
					expect(host.querySelector('[data-row="prepared"]')).toBe(preparedRow);
					expect(host.querySelector('[data-trailing-anchor]')).toBe(anchor);
					expect(preparedRow.nextElementSibling).toBe(anchor);
					flushSync(() => actionButton.click());
					expect(action).toHaveBeenCalledTimes(1);
					flushSync(() => root.render(clientList.ListView, { ...props, onAction: action }));
					expect(host.querySelector('[data-row="prepared"]')).toBeNull();
					expect(host.querySelector('[data-row="entry"]')).toBe(entry);
					expect(host.querySelector('[data-trailing-anchor]')).toBe(anchor);
					expect(getLeadingHydrationListRange(host)).not.toBeNull();
					if (wrapped && host.firstChild !== getLeadingHydrationListRange(host)!.start) {
						const wrapperClose = host.lastChild as Comment;
						const originalClose = wrapperClose.data;
						wrapperClose.data += '2';
						expect(getLeadingHydrationListRange(host)).toBeNull();
						wrapperClose.data = originalClose;
						expect(getLeadingHydrationListRange(host)).not.toBeNull();
					}
					expect(errors).toEqual([]);
					root.unmount();

					container.innerHTML = html;
					const clearHost = container.querySelector('ol')!;
					const originalMarkup = clearHost.innerHTML;
					const clearRange = getLeadingHydrationListRange(clearHost)!;
					const cleared = preparedNodes();
					clearRange.start.data = clearRange.itemsMarker;
					clearRange.end.before(...cleared);
					for (const node of cleared) clearHost.removeChild(node);
					if (!populated) clearRange.start.data = clearRange.emptyMarker;
					expect(clearHost.innerHTML).toBe(originalMarkup);
					const clearRoot = hydrateRoot(container, clientList.ListView, props, {
						onRecoverableError: (error) => errors.push(error),
					});
					flushSync(() => {});
					expect(container.querySelector('ol')).toBe(clearHost);
					expect(clearHost.querySelector('[data-row="prepared"]')).toBeNull();
					expect(errors).toEqual([]);
					clearRoot.unmount();
				}
			});
		}
	}
});
