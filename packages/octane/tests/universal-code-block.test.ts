import { describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	flushUniversalSync,
	type ObjectHostInstance,
} from '../src/universal.js';
import {
	BlockInsideForBody,
	BlockInsideIfBody,
	EmptyBlockDropped,
	ExplicitSetupBearingChild,
	RenderOnlyChild,
	ScopedEffectChild,
	SetupBearingChild,
} from './_fixtures/universal-code-block.object.tsrx';

function objectRoot() {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	return { container, root };
}

function allInstances(parent: { children: readonly ObjectHostInstance[] }): ObjectHostInstance[] {
	const output: ObjectHostInstance[] = [];
	for (const child of parent.children) {
		output.push(child, ...allInstances(child));
	}
	return output;
}

function findInstance(
	parent: { children: readonly ObjectHostInstance[] },
	name: string,
): ObjectHostInstance {
	const instance = allInstances(parent).find((candidate) => candidate.props.name === name);
	if (instance === undefined) throw new Error(`Missing object host instance ${name}.`);
	return instance;
}

function childNames(parent: { children: readonly ObjectHostInstance[] }): unknown[] {
	const scene = allInstances(parent).find((candidate) => candidate.type === 'scene');
	if (scene === undefined) throw new Error('Missing scene instance.');
	return scene.children.map((child) => child.props.name);
}

async function flushMicrotasks(count = 8): Promise<void> {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

describe('@{ } at JSX child position on a universal renderer', () => {
	it('render-only @{} renders its JSX root as a sibling', () => {
		const { container, root } = objectRoot();
		root.render(RenderOnlyChild, {});
		expect(childNames(container)).toEqual(['lead', 'block', 'tail']);
		expect(findInstance(container, 'block').props.value).toBe('block-body');
		root.unmount();
	});

	it('empty @{} is silently dropped (siblings sit adjacent)', () => {
		const { container, root } = objectRoot();
		root.render(EmptyBlockDropped, {});
		expect(childNames(container)).toEqual(['before', 'after']);
		root.unmount();
	});

	it('runs setup in a scoped child and preserves it across parent updates', () => {
		const { container, root } = objectRoot();
		root.render(SetupBearingChild, { label: 'first', value: 2 });
		const action = findInstance(container, 'setup-action');

		expect(childNames(container)).toEqual(['setup-before', 'setup-action', 'setup-after']);
		expect(action.props.value).toBe('first:4:0');

		flushUniversalSync(() => container.dispatchEvent(action, 'press', undefined));
		expect(findInstance(container, 'setup-action').props.value).toBe('first:4:1');

		root.render(SetupBearingChild, { label: 'second', value: 3 });
		const updated = findInstance(container, 'setup-action');
		expect(updated).toBe(action);
		expect(updated.props.value).toBe('second:6:1');
		root.unmount();
	});

	it('lowers the explicit {() => @{ }} scoped child to the same behavior', () => {
		const { container, root } = objectRoot();
		root.render(ExplicitSetupBearingChild, { label: 'first' });
		const action = findInstance(container, 'explicit-action');
		expect(action.props.value).toBe('first:0');

		flushUniversalSync(() => container.dispatchEvent(action, 'press', undefined));
		expect(findInstance(container, 'explicit-action').props.value).toBe('first:1');

		root.render(ExplicitSetupBearingChild, { label: 'second' });
		expect(findInstance(container, 'explicit-action')).toBe(action);
		expect(action.props.value).toBe('second:1');
		root.unmount();
	});

	it('compiles @{} inside a @for body with per-item setup', () => {
		const { container, root } = objectRoot();
		root.render(BlockInsideForBody, {
			items: [
				{ id: 'a', qty: 2 },
				{ id: 'b', qty: 5 },
			],
		});
		expect(childNames(container)).toEqual(['a', 'b']);
		expect(findInstance(container, 'a').props.value).toBe('a x2');
		expect(findInstance(container, 'b').props.value).toBe('b x5');
		root.unmount();
	});

	it('compiles @{} inside an @if body', () => {
		const { container, root } = objectRoot();
		root.render(BlockInsideIfBody, { show: true, label: 'world' });
		expect(findInstance(container, 'if-block').props.value).toBe('hello world');

		root.render(BlockInsideIfBody, { show: false, label: 'world' });
		expect(childNames(container)).toEqual([]);

		root.render(BlockInsideIfBody, { show: true, label: 'again' });
		expect(findInstance(container, 'if-block').props.value).toBe('hello again');
		root.unmount();
	});

	it('scopes effect lifecycle to the block child scope', async () => {
		const log: string[] = [];
		const { container, root } = objectRoot();
		root.render(ScopedEffectChild, { log: (entry: string) => log.push(entry) });
		await flushMicrotasks();
		expect(log).toEqual(['create:0']);

		const action = findInstance(container, 'effect-action');
		flushUniversalSync(() => container.dispatchEvent(action, 'press', undefined));
		await flushMicrotasks();
		expect(findInstance(container, 'effect-action').props.value).toBe('count:1');
		expect(log).toEqual(['create:0', 'cleanup:0', 'create:1']);

		root.unmount();
		await flushMicrotasks();
		expect(log).toEqual(['create:0', 'cleanup:0', 'create:1', 'cleanup:1']);
	});
});
