import { describe, expect, it } from 'vitest';
import { createElement, flushSync, hydrateRoot } from '../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import { act, mount } from './_helpers.js';
import {
	DirectiveMatrix,
	MultiStatementSetupArm,
	OnceExpressionArm,
	RenderableExpressionArm,
	TryExpressionArms,
} from './_fixtures/directive-expression-arms.tsrx';
import type {
	DirectiveMatrixProps,
	RenderableShape,
} from './_fixtures/directive-expression-arms.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/directive-expression-arms.tsrx';
const server =
	loadServerFixture<typeof import('./_fixtures/directive-expression-arms.tsrx')>(FIXTURE);

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function findTextNode(root: Node | null, value: string): Text | null {
	if (root == null) return null;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let current = walker.nextNode();
	while (current != null) {
		if (current.textContent === value) return current as Text;
		current = walker.nextNode();
	}
	return null;
}

function matrixProps(overrides: Partial<DirectiveMatrixProps> = {}): DirectiveMatrixProps {
	return {
		on: true,
		ifOn: 'if-on',
		ifOff: 'if-off',
		elseIfBranch: 'second',
		elseIfFirst: 'else-if-first',
		elseIfSecond: 'else-if-second',
		elseIfFallback: 'else-if-fallback',
		items: [
			{ id: 'a', value: 'item-a' },
			{ id: 'b', value: 'item-b' },
		],
		emptyValue: 'empty',
		kind: 'case',
		caseValue: 'case',
		defaultValue: 'default',
		outer: true,
		inner: 'match',
		nestedValue: 'nested',
		...overrides,
	};
}

describe('expression-only directive arms', () => {
	it('renders the requested renderable shapes and updates the live @if arm', () => {
		let clicks = 0;
		const result = mount(RenderableExpressionArm, {
			show: true,
			shape: 'primitive',
			label: 'primitive',
			onClick: () => clicks++,
		});
		const update = (shape: RenderableShape, label: string) =>
			result.update(RenderableExpressionArm, {
				show: true,
				shape,
				label,
				onClick: () => clicks++,
			});

		expect(result.find('#renderable-expression-arm').textContent).toBe('primitive');

		update('component', 'component');
		expect(result.find('#component-value').textContent).toBe('component');
		result.click('#component-value');
		expect(clicks).toBe(1);

		update('host', 'host');
		expect(result.find('#host-value').textContent).toBe('host');

		update('array', 'array');
		expect(result.find('#array-value').textContent).toBe('array');
		expect(result.find('#renderable-expression-arm').textContent).toBe('array array-tail');

		update('fragment', 'fragment');
		expect(result.find('#fragment-first').textContent).toBe('fragment');
		expect(result.find('#fragment-last').textContent).toBe(' fragment-tail');

		update('null', 'ignored');
		expect(result.find('#renderable-expression-arm').textContent).toBe('');

		result.update(RenderableExpressionArm, {
			show: false,
			shape: 'primitive',
			label: 'inactive',
		});
		expect(result.find('#renderable-expression-arm').textContent).toBe('');
		result.unmount();
	});

	it('renders if/else, for/empty, switch/default, and nested directive arms', () => {
		const result = mount(DirectiveMatrix, matrixProps());
		expect(result.find('#if-expression-arm').textContent).toBe('if-on');
		expect(result.find('#else-if-expression-arm').textContent).toBe('else-if-second');
		expect(result.find('#for-expression-arm').textContent).toBe('item-aitem-b');
		expect(result.find('#switch-expression-arm').textContent).toBe('case');
		expect(result.find('#nested-expression-arm').textContent).toBe('nested');

		result.update(
			DirectiveMatrix,
			matrixProps({
				on: false,
				elseIfBranch: 'other',
				items: [],
				kind: 'other',
				outer: false,
			}),
		);
		expect(result.find('#if-expression-arm').textContent).toBe('if-off');
		expect(result.find('#else-if-expression-arm').textContent).toBe('else-if-fallback');
		expect(result.find('#for-expression-arm').textContent).toBe('empty');
		expect(result.find('#switch-expression-arm').textContent).toBe('default');
		expect(result.find('#nested-expression-arm').textContent).toBe('');
		result.unmount();
	});

	it('evaluates a promoted expression once and preserves multi-statement setup semantics', () => {
		let reads = 0;
		const read = () => {
			reads++;
			return createElement('span', { id: 'once-value' }, 'once');
		};
		const result = mount(OnceExpressionArm, { on: true, read });
		expect(result.find('#once-value').textContent).toBe('once');
		expect(reads).toBe(1);

		result.update(OnceExpressionArm, { on: false, read });
		expect(reads).toBe(1);
		result.update(OnceExpressionArm, { on: true, read });
		expect(result.find('#once-value').textContent).toBe('once');
		expect(reads).toBe(2);
		result.unmount();

		let setupRuns = 0;
		const multi = mount(MultiStatementSetupArm, {
			on: true,
			observe: () => setupRuns++,
			value: createElement('span', { id: 'discarded-value' }, 'discarded'),
		});
		expect(setupRuns).toBe(1);
		expect(multi.findAll('#discarded-value')).toHaveLength(0);
		expect(multi.find('#multi-statement-arm').textContent).toBe('');
		multi.unmount();
	});

	it('moves through @pending, success, and @catch expression arms', async () => {
		const gate = deferred<string>();
		const result = mount(TryExpressionArms, {
			mode: 'pending',
			promise: gate.promise,
			label: 'unused',
		});
		expect(result.find('#try-pending-arm').textContent).toBe('pending');

		await act(() => gate.resolve('resolved'));
		expect(result.find('#try-success-arm').textContent).toBe('resolved');
		expect(result.findAll('#try-pending-arm')).toHaveLength(0);

		await act(() =>
			result.root.render(TryExpressionArms, {
				mode: 'error',
				label: 'unused',
			}),
		);
		expect(result.find('#try-catch-arm').textContent).toBe('caught:try boom');
		expect(result.findAll('#try-success-arm')).toHaveLength(0);
		result.unmount();
	});

	it('server-renders every directive arm and renderable shape', async () => {
		for (const [shape, expected] of [
			['primitive', 'primitive'],
			['component', 'component'],
			['host', 'host'],
			['array', 'array array-tail'],
			['fragment', 'fragment fragment-tail'],
			['null', ''],
		] as const) {
			const { html } = await ServerRT.renderToString(server.RenderableExpressionArm, {
				show: true,
				shape,
				label: shape,
			});
			const document = new DOMParser().parseFromString(html, 'text/html');
			expect(document.querySelector('#renderable-expression-arm')?.textContent).toBe(expected);
		}

		const active = await ServerRT.renderToString(server.DirectiveMatrix, matrixProps());
		const activeDocument = new DOMParser().parseFromString(active.html, 'text/html');
		expect(activeDocument.querySelector('#if-expression-arm')?.textContent).toBe('if-on');
		expect(activeDocument.querySelector('#else-if-expression-arm')?.textContent).toBe(
			'else-if-second',
		);
		expect(activeDocument.querySelector('#for-expression-arm')?.textContent).toBe('item-aitem-b');
		expect(activeDocument.querySelector('#switch-expression-arm')?.textContent).toBe('case');
		expect(activeDocument.querySelector('#nested-expression-arm')?.textContent).toBe('nested');

		const inactive = await ServerRT.renderToString(
			server.DirectiveMatrix,
			matrixProps({
				on: false,
				elseIfBranch: 'other',
				items: [],
				kind: 'other',
				outer: false,
			}),
		);
		const inactiveDocument = new DOMParser().parseFromString(inactive.html, 'text/html');
		expect(inactiveDocument.querySelector('#if-expression-arm')?.textContent).toBe('if-off');
		expect(inactiveDocument.querySelector('#else-if-expression-arm')?.textContent).toBe(
			'else-if-fallback',
		);
		expect(inactiveDocument.querySelector('#for-expression-arm')?.textContent).toBe('empty');
		expect(inactiveDocument.querySelector('#switch-expression-arm')?.textContent).toBe('default');
		expect(inactiveDocument.querySelector('#nested-expression-arm')?.textContent).toBe('');

		const success = await ServerRT.renderToString(server.TryExpressionArms, {
			mode: 'success',
			label: 'server-success',
		});
		expect(success.html).toContain('server-success');

		const pending = await ServerRT.renderToString(server.TryExpressionArms, {
			mode: 'pending',
			promise: new Promise<string>(() => {}),
			label: 'unused',
		});
		expect(pending.html).toContain('id="try-pending-arm"');

		const caught = await ServerRT.renderToString(server.TryExpressionArms, {
			mode: 'error',
			label: 'unused',
		});
		expect(caught.html).toContain('caught:try boom');

		let reads = 0;
		const once = await ServerRT.renderToString(server.OnceExpressionArm, {
			on: true,
			read: () => {
				reads++;
				return 'server-once';
			},
		});
		expect(once.html).toContain('server-once');
		expect(reads).toBe(1);

		let setupRuns = 0;
		const multi = await ServerRT.renderToString(server.MultiStatementSetupArm, {
			on: true,
			observe: () => setupRuns++,
			value: 'discarded',
		});
		const multiDocument = new DOMParser().parseFromString(multi.html, 'text/html');
		expect(multiDocument.querySelector('#multi-statement-arm')?.textContent).toBe('');
		expect(setupRuns).toBe(1);
	});

	it('hydrates existing directive output and keeps every arm live', async () => {
		const initialProps = matrixProps();
		const { html } = await ServerRT.renderToString(server.DirectiveMatrix, initialProps);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const matrix = container.querySelector('#directive-matrix');
		const ifSection = container.querySelector('#if-expression-arm');
		const elseIfSection = container.querySelector('#else-if-expression-arm');
		const forSection = container.querySelector('#for-expression-arm');
		const switchSection = container.querySelector('#switch-expression-arm');
		const nestedSection = container.querySelector('#nested-expression-arm');
		const ifText = findTextNode(ifSection, 'if-on');
		const elseIfText = findTextNode(elseIfSection, 'else-if-second');
		const firstItemText = findTextNode(forSection, 'item-a');
		const lastItemText = findTextNode(forSection, 'item-b');
		const switchText = findTextNode(switchSection, 'case');
		const nestedText = findTextNode(nestedSection, 'nested');
		expect([ifText, elseIfText, firstItemText, lastItemText, switchText, nestedText]).not.toContain(
			null,
		);

		const root = hydrateRoot(container, DirectiveMatrix, initialProps);
		flushSync(() => {});
		expect(container.querySelector('#directive-matrix')).toBe(matrix);
		expect(container.querySelector('#if-expression-arm')).toBe(ifSection);
		expect(container.querySelector('#else-if-expression-arm')).toBe(elseIfSection);
		expect(container.querySelector('#for-expression-arm')).toBe(forSection);
		expect(container.querySelector('#switch-expression-arm')).toBe(switchSection);
		expect(container.querySelector('#nested-expression-arm')).toBe(nestedSection);
		expect(findTextNode(ifSection, 'if-on')).toBe(ifText);
		expect(findTextNode(elseIfSection, 'else-if-second')).toBe(elseIfText);
		expect(findTextNode(forSection, 'item-a')).toBe(firstItemText);
		expect(findTextNode(forSection, 'item-b')).toBe(lastItemText);
		expect(findTextNode(switchSection, 'case')).toBe(switchText);
		expect(findTextNode(nestedSection, 'nested')).toBe(nestedText);

		flushSync(() =>
			root.render(
				DirectiveMatrix,
				matrixProps({
					on: false,
					elseIfBranch: 'other',
					items: [],
					kind: 'other',
					outer: false,
				}),
			),
		);
		expect(ifSection?.textContent).toBe('if-off');
		expect(elseIfSection?.textContent).toBe('else-if-fallback');
		expect(forSection?.textContent).toBe('empty');
		expect(switchSection?.textContent).toBe('default');
		expect(nestedSection?.textContent).toBe('');
		root.unmount();
		container.remove();
	});

	it('adopts success before moving through live @pending and @catch arms', async () => {
		const gate = deferred<string>();
		const initialProps = { mode: 'success' as const, label: 'hydrated-success' };
		const { html } = await ServerRT.renderToString(server.TryExpressionArms, initialProps);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const boundary = container.querySelector('#try-expression-arms');
		const success = container.querySelector('#try-success-arm');
		expect(boundary).not.toBeNull();
		expect(success).not.toBeNull();

		const root = hydrateRoot(container, TryExpressionArms, initialProps);
		flushSync(() => {});
		expect(container.querySelector('#try-expression-arms')).toBe(boundary);
		expect(container.querySelector('#try-success-arm')).toBe(success);

		await act(() =>
			root.render(TryExpressionArms, {
				mode: 'pending',
				promise: gate.promise,
				label: 'unused',
			}),
		);
		expect(container.querySelector('#try-pending-arm')?.textContent).toBe('pending');
		expect(container.querySelector('#try-success-arm')).toBeNull();

		await act(() => gate.resolve('resumed-success'));
		expect(container.querySelector('#try-success-arm')?.textContent).toBe('resumed-success');
		expect(container.querySelector('#try-pending-arm')).toBeNull();

		await act(() =>
			root.render(TryExpressionArms, {
				mode: 'error',
				label: 'unused',
			}),
		);
		expect(container.querySelector('#try-catch-arm')?.textContent).toBe('caught:try boom');
		expect(container.querySelector('#try-success-arm')).toBeNull();
		root.unmount();
		container.remove();
	});
});
