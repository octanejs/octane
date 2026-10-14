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
	);
	// A nested declaration cannot reuse a classified writer's name.
	assert.deepEqual(
		failures.map((finding) => [finding.owner, finding.operation]),
		[['<nested>.commitHost', 'call:remove']],
	);
	assert.deepEqual(stale, ['retired']);
});
