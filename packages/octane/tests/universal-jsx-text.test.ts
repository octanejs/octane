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
});
