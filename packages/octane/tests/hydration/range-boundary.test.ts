import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRuntime from 'octane/server';
import * as BehaviorRuntime from 'octane/behavior';
import { getLeadingHydrationListRange } from 'octane/hydration';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';
import { BoundaryClient } from './_fixtures/range-boundary.tsrx';

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
