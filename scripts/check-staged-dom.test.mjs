import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectStagedDOM } from './check-staged-dom.mjs';

const fixture = `
declare function domNode<T extends Node>(node: T): T;
function renderHost(el: HTMLElement, parent: Node, key: string) {
 domNode(el).setAttribute('title', 'prepared');
 domNode(parent).appendChild(el);
 const child = domNode(parent).firstChild;
 domNode(el).textContent = 'prepared';
 domNode(el).scrollTop = 20;
 return [child, el.nodeType, el.getBoundingClientRect()];
}
`;

test('the current client runtime classifies every direct native operation', () => {
	assert.deepEqual(inspectStagedDOM(), []);
});

test('accepts staged operations and committed identity/geometry reads', () => {
	assert.deepEqual(inspectStagedDOM(fixture), []);
});

test('rejects a live attribute write introduced by removing its preparation receiver', () => {
	const mutant = fixture.replace('domNode(el).setAttribute', 'el.setAttribute');
	const findings = inspectStagedDOM(mutant);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].operation, 'call:setAttribute');
	assert.equal(findings[0].owner, 'renderHost');
});

test('rejects unwrapped structure, arbitrary native properties, and any-cast aliases', () => {
	const findings = inspectStagedDOM(`
	function renderHost(el: HTMLElement, parent: Node, key: string) {
	 const alias: any = el;
	 parent.appendChild(el);
	 const child = parent.firstChild;
	 (el as any).textContent = 'early';
	 alias.setAttribute('title', 'early');
	 el.nonce = 'early';
	 (el as any)[key] = 'early';
	 return child;
	}`);
	assert.deepEqual(
		findings.map((finding) => finding.operation),
		[
			'call:appendChild',
			'read:firstChild',
			'write:textContent',
			'call:setAttribute',
			'write:nonce',
			'write:[dynamic]',
		],
	);
});

test('native exceptions are specific operations, not blanket function exemptions', () => {
	const findings = inspectStagedDOM(`
	function vtWaitForResources(img: HTMLImageElement) {
	 const complete = img.complete;
	 img.setAttribute('src', 'early');
	 return complete;
	}`);
	assert.deepEqual(
		findings.map((finding) => finding.operation),
		['call:setAttribute'],
	);
});
