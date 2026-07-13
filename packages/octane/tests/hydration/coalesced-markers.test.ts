import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import {
	KeyedReturnWrapper,
	KeyedWrapperList,
	ReturnedSuspenseChildSlot,
	SuspenseWrapperChain,
	SwappingBranch,
	WrapperChain,
} from './_fixtures/coalesced-markers.tsrx';
import { FragmentBarrier } from './_fixtures/coalesced-fragment-barrier.tsrx';
import { hydrationMarkerSummary } from './_marker-summary.js';

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/coalesced-markers.tsrx',
);

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'coalesced-markers.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}

const server = serverModule();

function renderServer(name: string, props: any): string {
	return ServerRT.renderToString(server[name], props).html;
}

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('hydrateRoot — coalesced counted hydration ranges', () => {
	it('coalesces sole-output wrappers while retaining logical depth and adopted state', () => {
		container.innerHTML = renderServer('WrapperChain', {});
		const section = container.querySelector('.wrapper-chain')!;
		const serverButton = section.querySelector('.wrapper-button') as HTMLButtonElement;
		const before = hydrationMarkerSummary(section);
		expect(before.logicalPairs).toBeGreaterThan(1);
		expect(before.physicalPairs).toBe(before.logicalPairs);

		const root = hydrateRoot(container, WrapperChain, {});
		const after = hydrationMarkerSummary(section);
		expect(after.logicalPairs).toBe(before.logicalPairs);
		expect(after.physicalPairs).toBe(1);
		expect(after.data).toEqual(['[' + before.logicalPairs, ']' + before.logicalPairs]);
		expect(section.querySelector('.wrapper-button')).toBe(serverButton);

		flushSync(() => serverButton.click());
		expect(section.querySelector('.wrapper-button')).toBe(serverButton);
		expect(serverButton.textContent).toBe('wrapped:1');
		expect(hydrationMarkerSummary(section)).toEqual(after);
		root.unmount();
	});

	it('materializes a shared branch range safely when the active arm swaps', () => {
		container.innerHTML = renderServer('SwappingBranch', { active: true });
		const section = container.querySelector('.swapping-branch')!;
		const serverButton = section.querySelector('.branch-button') as HTMLButtonElement;
		const before = hydrationMarkerSummary(section);

		const root = hydrateRoot(container, SwappingBranch, { active: true });
		const after = hydrationMarkerSummary(section);
		expect(after.logicalPairs).toBe(before.logicalPairs);
		expect(after.physicalPairs).toBe(1);
		expect(after.countedPairs).toBe(1);
		expect(section.querySelector('.branch-button')).toBe(serverButton);

		flushSync(() => serverButton.click());
		expect(serverButton.textContent).toBe('branch:1');
		flushSync(() => root.render(SwappingBranch, { active: false }));
		expect(section.querySelector('.branch-button')).toBeNull();
		expect(section.querySelector('.branch-off')?.textContent).toBe('off');
		expect(serverButton.isConnected).toBe(false);

		flushSync(() => root.render(SwappingBranch, { active: true }));
		const replacement = section.querySelector('.branch-button') as HTMLButtonElement;
		expect(replacement).not.toBe(serverButton);
		expect(replacement.textContent).toBe('branch:1');
		flushSync(() => replacement.click());
		expect(replacement.textContent).toBe('branch:2');
		root.unmount();
	});

	it('keeps return-position key ownership when its current value is undefined', () => {
		container.innerHTML = renderServer('KeyedReturnWrapper', { itemKey: undefined });
		const serverButton = container.querySelector('.keyed-return-button');
		const before = hydrationMarkerSummary(container);
		expect(before.logicalPairs).toBeGreaterThan(1);

		const root = hydrateRoot(container, KeyedReturnWrapper, { itemKey: undefined });
		const after = hydrationMarkerSummary(container);
		expect(after.logicalPairs).toBe(before.logicalPairs);
		expect(after.physicalPairs).toBe(before.physicalPairs);
		expect(after.countedPairs).toBe(0);
		expect(container.querySelector('.keyed-return-button')).toBe(serverButton);
		root.unmount();
	});

	it('keeps keyed item ownership independent while compacting wrapper descendants', () => {
		const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		container.innerHTML = renderServer('KeyedWrapperList', { rows });
		const list = container.querySelector('.coalesced-list')!;
		const serverRows = new Map(
			[...list.querySelectorAll<HTMLElement>('.coalesced-row')].map((row) => [row.dataset.id, row]),
		);
		const before = hydrationMarkerSummary(list);

		const root = hydrateRoot(container, KeyedWrapperList, { rows });
		const after = hydrationMarkerSummary(list);
		expect(after.logicalPairs).toBe(before.logicalPairs);
		// Each keyed item keeps one distinct physical ownership pair. Its counted
		// payload also records the coextensive descendant wrappers; no pair is
		// shared across items or with the outer @for range.
		expect(after.countedPairs).toBe(rows.length);
		expect(after.singletonPairs).toBe(1);
		expect(after.physicalPairs).toBe(rows.length + 1);
		for (const row of rows) {
			expect(list.querySelector(`[data-id="${row.id}"]`)).toBe(serverRows.get(row.id));
		}

		const bButton = serverRows.get('b')!.querySelector('.row-button') as HTMLButtonElement;
		flushSync(() => bButton.click());
		expect(bButton.textContent).toBe('b:1');

		const reordered = [rows[2], rows[1], rows[0]];
		flushSync(() => root.render(KeyedWrapperList, { rows: reordered }));
		expect([...list.querySelectorAll('.coalesced-row')]).toEqual([
			serverRows.get('c'),
			serverRows.get('b'),
			serverRows.get('a'),
		]);
		expect(bButton.textContent).toBe('b:1');
		expect(hydrationMarkerSummary(list)).toEqual(after);
		root.unmount();
	});

	it('retains an independent physical Suspense boundary around a compact descendant chain', () => {
		container.innerHTML = renderServer('SuspenseWrapperChain', {});
		const section = container.querySelector('.suspense-wrapper-chain')!;
		const serverButton = section.querySelector('.suspense-button');
		const before = hydrationMarkerSummary(section);

		const root = hydrateRoot(container, SuspenseWrapperChain, {});
		const after = hydrationMarkerSummary(section);
		expect(after.logicalPairs).toBe(before.logicalPairs);
		expect(after.countedPairs).toBeGreaterThanOrEqual(1);
		expect(after.physicalPairs).toBeLessThan(after.logicalPairs);
		// The whole coextensive-looking run must not become a single counted
		// pair: Suspense/try bookkeeping needs its own movable physical range.
		expect(after.physicalPairs).toBeGreaterThan(1);
		expect(after.singletonPairs).toBeGreaterThanOrEqual(1);
		expect(section.querySelector('.suspense-button')).toBe(serverButton);
		root.unmount();
	});

	it('keeps a returned value-position Suspense builtin as a physical childSlot barrier', () => {
		container.innerHTML = renderServer('ReturnedSuspenseChildSlot', {});
		const section = container.querySelector('.returned-suspense-child-slot')!;
		const serverButton = section.querySelector('.returned-suspense-button') as HTMLButtonElement;
		const before = hydrationMarkerSummary(section);
		expect(before.physicalPairs).toBe(before.logicalPairs);

		const root = hydrateRoot(container, ReturnedSuspenseChildSlot, {});
		const after = hydrationMarkerSummary(section);
		expect(after.logicalPairs).toBe(before.logicalPairs);
		expect(after.physicalPairs).toBeLessThan(after.logicalPairs);
		// The returned descriptor is classified by childSlot. Even though its
		// ranges are exactly coextensive, Suspense must retain an independent
		// singleton pair around the compactable descendant ownership chain.
		expect(after.countedPairs).toBeGreaterThanOrEqual(1);
		expect(after.singletonPairs).toBeGreaterThanOrEqual(1);
		expect(after.physicalPairs).toBeGreaterThan(1);
		expect(section.querySelector('.returned-suspense-button')).toBe(serverButton);
		expect(section.querySelector('.returned-pending')).toBeNull();

		flushSync(() => serverButton.click());
		expect(section.querySelector('.returned-suspense-button')).toBe(serverButton);
		expect(serverButton.textContent).toBe('returned:1');
		expect(hydrationMarkerSummary(section)).toEqual(after);
		root.unmount();
	});

	it('keeps a fragment-ref-bearing component frame as an independent range', () => {
		// Fragment refs are intentionally unsupported by server compilation today,
		// so spell the byte-equivalent hydratable shape explicitly: the two return-
		// component frames surround the persistent <!--frag--> template markers.
		container.innerHTML =
			'<!--[--><!--[--><!--frag-->' +
			'<button class="fragment-barrier-button">fragment</button>' +
			'<!--/frag--><!--]--><!--]-->';
		const serverButton = container.querySelector('.fragment-barrier-button');
		const fragmentRef: { current: unknown } = { current: null };

		const root = hydrateRoot(container, FragmentBarrier, { fragmentRef });
		flushSync(() => {});
		const after = hydrationMarkerSummary(container);
		expect(after.physicalPairs).toBe(2);
		expect(after.countedPairs).toBe(0);
		expect(container.querySelector('.fragment-barrier-button')).toBe(serverButton);
		expect(fragmentRef.current).not.toBeNull();
		root.unmount();
	});

	it('keeps both pairs when their combined multiplicity would exceed a safe integer', () => {
		container.innerHTML = renderServer('WrapperChain', {});
		const section = container.querySelector('.wrapper-chain')!;
		const markers = Array.from(section.childNodes).filter(
			(node): node is Comment => node.nodeType === Node.COMMENT_NODE,
		);
		expect(markers.length).toBeGreaterThan(2);
		const max = String(Number.MAX_SAFE_INTEGER);
		markers[0].data = '[' + max;
		markers[markers.length - 1].data = ']' + max;

		const root = hydrateRoot(container, WrapperChain, {});
		const after = Array.from(section.childNodes).filter(
			(node): node is Comment => node.nodeType === Node.COMMENT_NODE,
		);
		// The inner wrapper run may compact among itself, but it must not be folded
		// into MAX_SAFE_INTEGER and produce an unparseable `[9007199254740992`.
		expect(after).toHaveLength(4);
		expect(after[0]).toBe(markers[0]);
		expect(after[0].data).toBe('[' + max);
		expect(after[after.length - 1]).toBe(markers[markers.length - 1]);
		expect(after[after.length - 1].data).toBe(']' + max);
		root.unmount();
	});

	it('uses the legacy spelling as the only canonical multiplicity-one marker', () => {
		const probe = document.createElement('div');
		for (const data of ['[1', ']1', '[', ']', '[2', ']2']) {
			probe.appendChild(document.createComment(data));
		}
		expect(hydrationMarkerSummary(probe).data).toEqual(['[', ']', '[2', ']2']);
	});
});
