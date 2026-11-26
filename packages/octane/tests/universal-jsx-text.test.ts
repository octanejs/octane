import { describe, expect, it } from 'vitest';
import type { ComponentBody } from '../src/index.js';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	type ObjectHostInstance,
} from '../src/universal.js';
import { mount } from './_helpers';
import * as DomScenes from './_fixtures/universal-jsx-text.tsrx';
import * as ObjectScenes from './_fixtures/universal-jsx-text.object.tsrx';

type SceneName = keyof typeof DomScenes & keyof typeof ObjectScenes;

function objectText(parent: { readonly children: readonly ObjectHostInstance[] }): string {
	let output = '';
	for (const child of parent.children) {
		output += child.type === '#text' ? String(child.props.value) : objectText(child);
	}
	return output;
}

function renderObject(name: SceneName): string {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	root.render(ObjectScenes[name] as never);
	const text = objectText(container);
	root.unmount();
	return text;
}

function renderDom(name: SceneName): string {
	const mounted = mount(DomScenes[name] as ComponentBody<undefined>);
	const text = mounted.container.textContent ?? '';
	mounted.unmount();
	return text;
}

describe('universal JSX text whitespace', () => {
	it.each([
		['TrailingSpaceBeforeElement', 'Before middle after'],
		['MultilineText', 'First line second line inlinelast line'],
		['TabsInText', 'Tab separated x end'],
	] as const)('%s renders the same text as the DOM compiler', (name, expected) => {
		expect(renderDom(name)).toBe(expected);
		expect(renderObject(name)).toBe(expected);
	});

	it.each([
		['SpaceBetweenInlineSiblings', 'a b  c'],
		['NewlineSeparatedSiblings', 'ab c'],
		['MixedTextAndExpressions', 'x and y! x y'],
		['EdgeWhitespaceInsideElements', '  inner  next '],
		['SpaceBetweenFragmentSiblings', 'a b'],
		['SpaceAroundComponentChildren', ' va bv '],
	] as const)(
		'%s keeps the same whitespace between siblings as the DOM compiler',
		(name, expected) => {
			expect(renderDom(name)).toBe(expected);
			expect(renderObject(name)).toBe(expected);
			expect(objectShape(name)).toEqual(domShape(name));
		},
	);
});

// Element nesting with adjacent text merged, as the DOM normalizes it. Anchors
// and markers are not content and stay out.
type Shape = readonly (string | Shape)[];

function mergeText(parts: (string | Shape)[]): Shape {
	const merged: (string | Shape)[] = [];
	for (const part of parts) {
		const last = merged[merged.length - 1];
		if (typeof part === 'string' && typeof last === 'string')
			merged[merged.length - 1] = last + part;
		else if (part !== '') merged.push(part);
	}
	return merged;
}

function domNodeShape(node: Node): Shape {
	const parts: (string | Shape)[] = [];
	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === 3) parts.push(child.nodeValue ?? '');
		else if (child.nodeType === 1) parts.push(domNodeShape(child));
	}
	return mergeText(parts);
}

function objectNodeShape(parent: { readonly children: readonly ObjectHostInstance[] }): Shape {
	const parts: (string | Shape)[] = [];
	for (const child of parent.children) {
		parts.push(child.type === '#text' ? String(child.props.value) : objectNodeShape(child));
	}
	return mergeText(parts);
}

function domShape(name: SceneName): Shape {
	const mounted = mount(DomScenes[name] as ComponentBody<undefined>);
	const shape = domNodeShape(mounted.container);
	mounted.unmount();
	return shape;
}

function objectShape(name: SceneName): Shape {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	root.render(ObjectScenes[name] as never);
	const shape = objectNodeShape(container);
	root.unmount();
	return shape;
}
