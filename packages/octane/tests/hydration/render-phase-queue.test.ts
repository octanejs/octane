import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import {
	Aborting,
	ForeignRows,
	NestedFlush,
	queueForeignUpdates,
	Runaway,
	SettlingRows,
} from './_fixtures/render-phase-queue.tsrx';

const FIXTURE = 'packages/octane/tests/hydration/_fixtures/render-phase-queue.tsrx';
const server = loadServerFixture<typeof import('./_fixtures/render-phase-queue.tsrx')>(FIXTURE);

let foreign: HTMLDivElement;
let target: HTMLDivElement;

function rowText(container: HTMLElement, selector: string): Array<string | null> {
	return Array.from(container.querySelectorAll(selector), (node) => node.textContent);
}

function mountForeign(count: number, renders: number[]) {
	const root = createRoot(foreign);
	root.render(ForeignRows, {
		count,
		onRender(index: number, value: number) {
			if (value === 1) renders.push(index);
		},
	});
	return root;
}

beforeEach(() => {
	foreign = document.createElement('div');
	target = document.createElement('div');
	document.body.append(foreign, target);
});

afterEach(() => {
	vi.restoreAllMocks();
	foreign.remove();
	target.remove();
});

describe('hydrateRoot — render-phase queue isolation', () => {
	it('drains re-entrant target updates while preserving queued foreign work', () => {
		const renders: number[] = [];
		const foreignRoot = mountForeign(4, renders);
		target.innerHTML = renderToString(server.SettlingRows, { count: 4, settle: false }).html;
		const serverRows = Array.from(target.querySelectorAll('[data-settling-row]'));

		queueForeignUpdates(4);
		const targetRoot = hydrateRoot(target, SettlingRows, { count: 4, settle: true });

		expect(Array.from(target.querySelectorAll('[data-settling-row]'))).toEqual(serverRows);
		expect(rowText(target, '[data-settling-row]')).toEqual(Array(4).fill('target:2'));
		expect(rowText(foreign, '[data-foreign-row]')).toEqual(Array(4).fill('foreign:0'));
		expect(renders).toEqual([]);

		flushSync(() => {});
		expect(rowText(foreign, '[data-foreign-row]')).toEqual(Array(4).fill('foreign:1'));
		expect(renders).toEqual([0, 1, 2, 3]);

		const first = target.querySelector('[data-settling-row]') as HTMLButtonElement;
		flushSync(() => first.click());
		expect(first.textContent).toBe('target:3');

		targetRoot.unmount();
		foreignRoot.unmount();
	});

	it('preserves queued foreign work when hydration exceeds the render limit', () => {
		const renders: number[] = [];
		const foreignRoot = mountForeign(3, renders);
		target.innerHTML = renderToString(server.Runaway, { runaway: false }).html;
		queueForeignUpdates(3);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(() => hydrateRoot(target, Runaway, { runaway: true })).toThrow(
			/Too many re-renders|error #9/,
		);
		expect(rowText(foreign, '[data-foreign-row]')).toEqual(Array(3).fill('foreign:0'));
		expect(renders).toEqual([]);

		flushSync(() => {});
		expect(rowText(foreign, '[data-foreign-row]')).toEqual(Array(3).fill('foreign:1'));
		expect(renders).toEqual([0, 1, 2]);

		foreignRoot.unmount();
	});

	it('preserves an unread foreign suffix when target rendering aborts', () => {
		const renders: number[] = [];
		const foreignRoot = mountForeign(3, renders);
		target.innerHTML = renderToString(server.Aborting, {
			abort: false,
			queueForeign() {},
		}).html;
		vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(() =>
			hydrateRoot(target, Aborting, {
				abort: true,
				queueForeign() {
					queueForeignUpdates(3);
				},
			}),
		).toThrow('hydration queue abort');
		expect(rowText(foreign, '[data-foreign-row]')).toEqual(Array(3).fill('foreign:0'));
		expect(renders).toEqual([]);

		flushSync(() => {});
		expect(rowText(foreign, '[data-foreign-row]')).toEqual(Array(3).fill('foreign:1'));
		expect(renders).toEqual([0, 1, 2]);

		foreignRoot.unmount();
	});

	it('survives flushSync nested in a hydration replay', () => {
		const renders: number[] = [];
		const foreignRoot = mountForeign(3, renders);
		target.innerHTML = renderToString(server.NestedFlush, { flush: false }).html;
		const serverNode = target.querySelector('[data-nested-flush]');
		queueForeignUpdates(3);
		let targetRoot!: ReturnType<typeof hydrateRoot>;

		expect(() => {
			targetRoot = hydrateRoot(target, NestedFlush, { flush: true });
			flushSync(() => {});
		}).not.toThrow();
		expect(target.querySelector('[data-nested-flush]')).toBe(serverNode);
		expect(serverNode?.textContent).toBe('nested-flush:1');
		expect(rowText(foreign, '[data-foreign-row]')).toEqual(Array(3).fill('foreign:1'));
		expect(renders).toEqual([0, 1, 2]);

		targetRoot.unmount();
		foreignRoot.unmount();
	});
});
