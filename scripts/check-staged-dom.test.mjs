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

test('accepts native receivers guarded by the renderer stage and their prepared counterpart', () => {
	assert.deepEqual(
		inspectStagedDOM(`
	declare let STAGED_DOM: { view<T extends Node | null | undefined>(node: T): T } | null;
	function renderHost(el: HTMLElement, parent: Node | null) {
	 (STAGED_DOM?.view(el) ?? el).setAttribute('title', 'prepared');
	 const host = (STAGED_DOM?.view(el!) ?? (el as HTMLElement));
	 host.textContent = 'prepared';
	 (STAGED_DOM?.view(parent) ?? parent)?.appendChild(el);
	}`),
		[],
	);
});

test('rejects receiver alternatives without the optional stage and matching node', () => {
	const findings = inspectStagedDOM(`
	declare let STAGED_DOM: { view<T extends Node>(node: T): T; other<T extends Node>(node: T): T } | null;
	declare function domNode<T extends Node>(node: T): T;
	function renderHost(el: HTMLElement, other: HTMLElement, unrelated: typeof STAGED_DOM) {
	 (el ?? STAGED_DOM?.view(el)).setAttribute('title', 'swapped');
	 (unrelated?.view(el) ?? el).setAttribute('title', 'unrelated stage');
	 (STAGED_DOM?.view(other) ?? el).setAttribute('title', 'wrong node');
	 (STAGED_DOM?.view(el) || el).setAttribute('title', 'wrong operator');
	 (STAGED_DOM!.view(el) ?? el).setAttribute('title', 'unguarded stage');
	 (STAGED_DOM!.view?.(el) ?? el).setAttribute('title', 'optional method');
	 (STAGED_DOM?.other(el) ?? el).setAttribute('title', 'wrong method');
	 (STAGED_DOM === null ? el : domNode(el)).setAttribute('title', 'unclassified ternary');
	 const holder = { current: el };
	 (STAGED_DOM?.view(holder.current) ?? holder.current).setAttribute('title', 'getter');
	 const getHost = () => el;
	 (STAGED_DOM?.view(getHost()) ?? getHost()).setAttribute('title', 'function');
	}
	function shadowStage(el: HTMLElement, STAGED_DOM: { view(node: HTMLElement): HTMLElement } | null) {
	 (STAGED_DOM?.view(el) ?? el).setAttribute('title', 'shadowed stage');
	}`);
	assert.deepEqual(
		findings.map((finding) => finding.operation),
		Array(11).fill('call:setAttribute'),
	);
	assert.deepEqual(
		findings.map((finding) => finding.owner),
		[...Array(10).fill('renderHost'), 'shadowStage'],
	);
});

test('cached native getters exempt only their reviewed property reads', () => {
	const findings = inspectStagedDOM(`
	function getFirstChild(node: Node) {
	 const first = node.firstChild;
	 node.textContent = 'early';
	 return first;
	}
	function getNextSibling(node: Node) {
	 const next = node.nextSibling;
	 node.removeChild(next!);
	 return next;
	}
	function renderHost(node: Node) {
	 function getFirstChild() { return node.firstChild; }
	 function getNextSibling() { return node.nextSibling; }
	 return [getFirstChild(), getNextSibling()];
	}`);
	assert.deepEqual(
		findings.map((finding) => finding.operation),
		['write:textContent', 'call:removeChild', 'read:firstChild', 'read:nextSibling'],
	);
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
	// Constant keys retain their native-property classification without making
	// a renderer-owned expando look like an arbitrary computed native access.
	const constants = inspectStagedDOM(`
	const NATIVE = 'nodeValue';
	const EXPANDO = '__oct_dangerHTML';
	function renderHost(node: Node, key: string, claimed: '__oct_dangerHTML') {
	 const active = (node as any)[EXPANDO];
	 (node as any)[NATIVE] = 'early';
	 return [(node as any)[NATIVE], (node as any)[key], active,
	   (node as any)[key as '__oct_dangerHTML'], (node as any)[claimed]];
	}`);
	assert.deepEqual(
		constants.map((finding) => finding.operation),
		['write:nodeValue', 'read:nodeValue', 'read:[dynamic]', 'read:[dynamic]', 'read:[dynamic]'],
	);
});

test('native exceptions are specific operations, not blanket function exemptions', () => {
	const findings = inspectStagedDOM(`
	function vtWaitForResources(img: HTMLImageElement) {
	 const complete = img.complete;
	 img.setAttribute('src', 'early');
	 return complete;
	}
	function hydrateRoot(container: Node, anchor: Node) {
	 const owned = container.contains(anchor);
	 container.appendChild(anchor);
	 return owned;
	}
	function beginPresentationHydration(marker: Node) {
	 const sibling = marker.nextSibling;
	 marker.textContent = 'early';
	 return sibling;
	}
	function retireDetachedBindingLeases(container: Node, anchor: Node) {
	 const retained = container.contains(anchor);
	 container.removeChild(anchor);
	 return retained;
	}
	function currentPresentation(node: Node, container: Node) {
	 const parent = node.parentNode;
	 const owned = container.contains(node);
	 node.textContent = 'early';
	 return [parent, owned];
	}
	function presentationRange(node: Comment) {
	 const marker = node.data;
	 node.data = 'early';
	 return marker;
	}
	function prepareSignalHostPropSources(node: Element) {
	 const custom = node.hasAttribute('is');
	 node.setAttribute('is', 'early');
	 return custom;
	}
	function preparePresentationSignalValue(container: Node, element: HTMLTextAreaElement) {
	 const owned = container.contains(element);
	 element.addEventListener('blur', () => {});
	 const value = element.value;
	 element.value = 'early';
	 element.setAttribute('title', 'early');
	 return [owned, value];
	}`);
	assert.deepEqual(
		findings.map((finding) => finding.operation),
		[
			'call:setAttribute',
			'call:appendChild',
			'write:textContent',
			'call:removeChild',
			'write:textContent',
			'write:data',
			'call:setAttribute',
			'write:value',
			'call:setAttribute',
		],
	);
});

test('nested declarations cannot reuse a reviewed native-operation exemption', () => {
	const findings = inspectStagedDOM(`
	function renderHost(el: HTMLElement) {
	 function vtFlush() { return el.getAttribute('title'); }
	 return vtFlush();
	}
	const renderAnotherHost = (el: HTMLElement) => {
	 function vtFlush() { return el.getAttribute('title'); }
	 class ViewTransitionPseudoElement {
	  animate() { return el.animate({ opacity: [0, 1] }); }
	 }
	 return vtFlush();
	};`);
	assert.deepEqual(
		findings.map((finding) => finding.operation),
		['call:getAttribute', 'call:getAttribute', 'call:animate'],
	);
});
