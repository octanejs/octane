import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectRenderWrites } from './check-render-writes.mjs';

const operations = (findings) => findings.map((finding) => finding.operation);

test('every native DOM write in the client runtime is in a classified writer', () => {
	const { failures, stale } = inspectRenderWrites();
	assert.deepEqual(failures, []);
	assert.deepEqual(stale, []);
});

test('rejects DOM writes in an unclassified function and ignores reads', () => {
	const { failures } = inspectRenderWrites(`
	function renderHost(el: HTMLElement, parent: Node, text: Text) {
	 const child = parent.firstChild;
	 const connected = !el.isConnected;
	 const title = el.getAttribute('title');
	 el.setAttribute('title', 'early');
	 parent.appendChild(el);
	 text.nodeValue = 'early';
	 el.style.color = 'red';
	 el.style.setProperty('color', 'red');
	 el.classList.add('early');
	 return [child, connected, title, el.getBoundingClientRect()];
	}`);
	assert.deepEqual(operations(failures), [
		'call:setAttribute',
		'call:appendChild',
		'write:nodeValue',
		'write:color',
		'call:setProperty',
		'call:add',
	]);
	assert.ok(failures.every((finding) => finding.owner === 'renderHost'));
});

test('follows casts and aliases, but not renderer expandos or events', () => {
	const { failures } = inspectRenderWrites(`
	const NATIVE = 'nodeValue';
	const EXPANDO = '__oct_dangerHTML';
	function renderHost(el: HTMLElement, node: Node, event: Event, key: symbol) {
	 const host = el;
	 host.textContent = 'early';
	 (el as unknown as HTMLInputElement).value = 'early';
	 (node as any)[NATIVE] = 'early';
	 (node as any)[EXPANDO] = 'metadata';
	 (node as any).$$owner = null;
	 (node as any)[key] = 1;
	 event.cancelBubble = true;
	}`);
	assert.deepEqual(operations(failures), ['write:textContent', 'write:value', 'write:nodeValue']);
});

test('accepts writes in classified writers and reports stale entries', () => {
	const writers = new Map([
		['commitHost', 'commit'],
		['FreshClone.fill', 'fresh'],
		['retired', 'commit'],
	]);
	const { failures, stale } = inspectRenderWrites(
		`
	function commitHost(el: HTMLElement) { el.setAttribute('title', 'committed'); }
	class FreshClone { fill(el: HTMLElement) { el.textContent = 'fresh'; } }
	function renderHost(el: HTMLElement) {
	 function commitHost() { el.remove(); }
	 return commitHost();
	}`,
		undefined,
		writers,
		new Map(),
	);
	// A nested declaration cannot reuse a classified writer's name.
	assert.deepEqual(
		failures.map((finding) => [finding.owner, finding.operation]),
		[['<nested>.commitHost', 'call:remove']],
	);
	assert.deepEqual(stale, ['retired']);
});

test('a fresh writer that reaches runtime structure must test for a frontier', () => {
	const writers = new Map([
		['anchor', 'fresh'],
		['guarded', 'fresh'],
		['passed', 'fresh'],
		['made', 'fresh'],
	]);
	const { failures, stale } = inspectRenderWrites(
		`
	import { usesFrontier } from './runtime/commit.js';
	interface Block { parentNode: Node; endMarker: Node | null }
	function anchor(block: Block) {
	 const parent = block.parentNode;
	 parent.insertBefore(document.createComment(''), block.endMarker);
	}
	function guarded(block: Block) {
	 const parent = block.parentNode;
	 if (!usesFrontier(block, parent)) parent.insertBefore(document.createComment(''), block.endMarker);
	}
	function passed(parent: Node, before: Node | null) {
	 parent.insertBefore(document.createComment(''), before);
	}
	function made(frag: DocumentFragment) {
	 const el = document.createElement('p');
	 el.textContent = 'fresh';
	 frag.appendChild(el);
	}`,
		undefined,
		writers,
		new Map([['stillListed', 'fixed since']]),
	);
	assert.deepEqual(
		failures.map((finding) => [finding.owner, finding.operation, finding.unguarded]),
		[['anchor', 'call:insertBefore', true]],
	);
	assert.deepEqual(stale, ['stillListed']);
});

test('a guard mention does not protect an unrelated write', () => {
	const writers = new Map([
		['commented', 'fresh'],
		['unrelated', 'fresh'],
		['wrongBranch', 'fresh'],
		['unstable', 'fresh'],
		['shadowed', 'fresh'],
		['guarded', 'fresh'],
	]);
	const { failures } = inspectRenderWrites(
		`
	import { usesFrontier } from './runtime/commit.js';
	interface Block { parentNode: Node; endMarker: Node | null }
	declare function getParent(): Node;
	function commented(block: Block) {
	 // ROOT_RENDER_TRANSACTION is absent here.
	 block.parentNode.insertBefore(document.createComment(''), block.endMarker);
	}
	function unrelated(block: Block) {
	 if (usesFrontier(block, block.parentNode)) console.log('frontier');
	 block.parentNode.insertBefore(document.createComment(''), block.endMarker);
	}
	function wrongBranch(block: Block) {
	 const parent = block.parentNode;
	 if (usesFrontier(block, parent)) parent.appendChild(document.createComment(''));
	}
	function unstable(block: Block) {
	 if (!usesFrontier(block, getParent())) getParent().appendChild(document.createComment(''));
	}
	function shadowed(block: Block, usesFrontier: (block: Block, parent: Node) => boolean) {
	 const parent = block.parentNode;
	 if (!usesFrontier(block, parent)) parent.appendChild(document.createComment(''));
	}
	function guarded(block: Block) {
	 const parent = block.parentNode;
	 if (!usesFrontier(block, parent))
	  parent.insertBefore(document.createComment(''), block.endMarker);
	}`,
		undefined,
		writers,
		new Map(),
	);
	assert.deepEqual(
		failures.map(({ owner, unguarded }) => [owner, unguarded]),
		[
			['commented', true],
			['unrelated', true],
			['wrongBranch', true],
			['unstable', true],
			['shadowed', true],
		],
	);
});

test('a site audit cannot cover an additional identical write', () => {
	const { failures, stale } = inspectRenderWrites(
		`interface Block { parentNode: Node }
		function audited(block: Block) {
		 block.parentNode.appendChild(document.createComment('one'));
		 block.parentNode.appendChild(document.createComment('two'));
		}`,
		undefined,
		new Map([['audited', 'fresh']]),
		new Map(),
		new Map([
			[
				'../runtime.ts:audited:call:appendChild:block.parentNode.appendChild',
				[1, 'specific invariant'],
			],
		]),
	);
	assert.equal(failures.length, 1);
	assert.equal(failures[0].unguarded, true);
	assert.deepEqual(stale, []);
});

test('transaction guards must read the runtime binding at the branch', () => {
	const { failures } = inspectRenderWrites(
		`import { ROOT_RENDER_TRANSACTION } from './runtime/render.js';
		interface Block { parentNode: Node }
		declare function beginRootRender(): void;
		function direct(block: Block) {
		 const parent = block.parentNode;
		 if (ROOT_RENDER_TRANSACTION === null) parent.appendChild(document.createComment(''));
		}
		function shadow(block: Block, ROOT_RENDER_TRANSACTION: null) {
		 const parent = block.parentNode;
		 if (ROOT_RENDER_TRANSACTION === null) parent.appendChild(document.createComment(''));
		}
		function snapshot(block: Block) {
		 const parent = block.parentNode;
		 const transaction = ROOT_RENDER_TRANSACTION;
		 beginRootRender();
		 if (transaction === null) parent.appendChild(document.createComment(''));
		}`,
		undefined,
		new Map([
			['direct', 'fresh'],
			['shadow', 'fresh'],
			['snapshot', 'fresh'],
		]),
		new Map(),
	);
	assert.deepEqual(
		failures.map(({ owner }) => owner),
		['shadow', 'snapshot'],
	);
});
