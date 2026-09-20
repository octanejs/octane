import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement, lazy, type ComponentBody } from 'octane';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const source = readFileSync(
	'packages/octane/tests/_fixtures/output-ownership-handoff.tsrx',
	'utf8',
);

function compileFixture() {
	return loadCompiledFixtureSource(source, {
		id: 'output-ownership-handoff.tsrx',
		mode: 'client',
		compileOptions: {
			hmr: false,
			dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
			autoMemo: true,
			inlineHookMemo: true,
		},
	});
}

function resolvedLazyBody(first: ComponentBody<any>) {
	let current = first;
	const Lazy = lazy(
		() =>
			({
				then(resolve: (module: { default: ComponentBody<any> }) => void) {
					resolve({
						get default() {
							return current;
						},
					});
				},
			}) as PromiseLike<{ default: ComponentBody<any> }>,
	);
	return {
		Lazy,
		select(body: ComponentBody<any>) {
			current = body;
		},
	};
}

describe('resolved lazy component output', () => {
	for (const name of ['ConditionalLabel', 'SelectedLabel'] as const) {
		it(`keeps conditional output after switching to ${name}`, () => {
			const fixture = compileFixture();
			const selected = resolvedLazyBody(() =>
				createElement(fixture.NativeLabel, { text: 'returned' }),
			);
			const view = mount(selected.Lazy, { text: 'returned', alternate: false });
			try {
				const previous = view.find('span');
				expect(previous.textContent).toBe('returned');
				selected.select(fixture[name]);
				for (const props of [
					{ text: 'first branch', alternate: false },
					{ text: 'updated first branch', alternate: false },
					{ text: 'second branch', alternate: true },
					{ text: 'updated second branch', alternate: true },
					{ text: 'first branch again', alternate: false },
				]) {
					view.update(selected.Lazy, props);
					expect(view.container.textContent).toBe(props.text);
					expect(view.find(props.alternate ? 'strong' : 'span').textContent).toBe(props.text);
				}
				expect(previous.isConnected).toBe(false);
			} finally {
				view.unmount();
			}
		});
	}

	it('renders mapped rows after switching from an empty returned array', () => {
		const fixture = compileFixture();
		const selected = resolvedLazyBody(() => []);
		const rows = Array.from({ length: 20 }, (_, id) => ({ id, text: `row ${id}` }));
		const view = mount(selected.Lazy, { rows });
		try {
			expect(view.container.textContent).toBe('');
			selected.select(fixture.MappedLabels);
			for (const next of [rows, rows, [...rows].reverse()]) {
				view.update(selected.Lazy, { rows: next });
				expect(view.findAll('[data-row]').map((row) => row.textContent)).toEqual(
					next.map((row) => row.text),
				);
			}
		} finally {
			view.unmount();
		}
	});

	it('keeps visible Activity output after switching from a returned component', () => {
		const fixture = compileFixture();
		const selected = resolvedLazyBody(() =>
			createElement(fixture.NativeLabel, { text: 'returned' }),
		);
		const view = mount(selected.Lazy, { text: 'returned' });
		try {
			expect(view.container.textContent).toBe('returned');
			selected.select(fixture.VisibleLabel);
			for (const text of ['visible first', 'visible updated', 'visible updated', 'visible again']) {
				view.update(selected.Lazy, { text });
				expect(view.container.textContent).toBe(text);
				expect(view.find('span').textContent).toBe(text);
			}
		} finally {
			view.unmount();
		}
	});
});
