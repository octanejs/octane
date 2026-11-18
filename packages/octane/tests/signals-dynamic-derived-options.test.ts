import { expect, it } from 'vitest';
import { flushSync } from 'octane';
import * as Signals from 'octane/signals';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// Keep this fixture alone: another component's scalar installer would mask a
// dispatcher that forgot to install views for its configured branch.
const fixture = loadCompiledFixtureSource(
	`import { derived$ } from 'octane/signals';
export function Dynamic(props) @{
 const value$ = derived$(() => ({value: props.value}), props.options);
 <output>{String(value$.get().value)}</output>
}`,
	{
		id: '/packages/octane/tests/_fixtures/dynamic-derived-options.tsrx',
		mode: 'client',
		runtimeModules: { 'octane/signals': Signals },
	},
);

it('stages dynamic instance options for both scalar and general derived bindings', () => {
	for (const options of [
		{ sync: true, equals: (a: { value: number }, b: { value: number }) => a.value === b.value },
		undefined,
	]) {
		const rendered = mount(fixture.Dynamic, { value: 1, options });
		try {
			expect(rendered.container.textContent).toBe('1');
			flushSync(() => rendered.root.render(fixture.Dynamic, { value: 2, options }));
			expect(rendered.container.textContent).toBe('2');
		} finally {
			rendered.unmount();
		}
	}
});
