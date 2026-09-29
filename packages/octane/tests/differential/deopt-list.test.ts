import { describe, expect, it } from 'vitest';
import { mountDifferential, preloadDifferentialFixture } from './_rig.js';
import { resolve } from 'node:path';

// The de-opt path with React as the byte-for-byte oracle: the SAME `.tsrx` runs
// through Octane AND @tsrx/react. `createElement` resolves to Octane's de-opt
// element on the Octane side and to React.createElement on the React side, so a
// pass proves Octane's runtime array-child reconciliation matches React's.
const DEOPT = resolve(__dirname, '../_fixtures/deopt-list.tsrx');

await preloadDifferentialFixture(DEOPT);

describe('differential: deopt-list.tsrx — array of host descriptors vs React', () => {
	it('DeoptList: renders a keyed array of <li> identically', async () => {
		const d = await mountDifferential(DEOPT, 'DeoptList', {
			items: [
				{ id: 1, label: 'a' },
				{ id: 2, label: 'b' },
				{ id: 3, label: 'c' },
			],
		});
		await d.step('mount', () => {});
		d.unmount();
	});

	it('DeoptListStateful: reorder / append / remove stay byte-identical', async () => {
		const d = await mountDifferential(DEOPT, 'DeoptListStateful');
		await d.step('mount', () => {});
		await d.step('reverse', async (i, r) => {
			await i.click('#reverse');
			await r.click('#reverse');
		});
		await d.step('add', async (i, r) => {
			await i.click('#add');
			await r.click('#add');
		});
		await d.step('remove', async (i, r) => {
			await i.click('#remove');
			await r.click('#remove');
		});
		await d.step('reverse again', async (i, r) => {
			await i.click('#reverse');
			await r.click('#reverse');
		});
		d.unmount();
	});

	// The ergonomic form: plain JSX `.map` (no createElement). Compiler lowers
	// `<li/>` → createElement on the Octane side; native React `.map` on the other.
	it('JsxListStateful: plain JSX `.map` reorder/insert/remove vs React', async () => {
		const d = await mountDifferential(DEOPT, 'JsxListStateful');
		await d.step('mount', () => {});
		await d.step('reverse', async (i, r) => {
			await i.click('#reverse');
			await r.click('#reverse');
		});
		await d.step('add', async (i, r) => {
			await i.click('#add');
			await r.click('#add');
		});
		await d.step('remove', async (i, r) => {
			await i.click('#remove');
			await r.click('#remove');
		});
		d.unmount();
	});
});

// React evaluates JSX when the expression runs. Octane defers non-literal
// children and props to render, so a binding reassigned after the JSX evaluated
// must still read the value it had then.
describe('differential: deopt-list.tsrx — JSX values read reassigned bindings at creation', () => {
	it('CounterJsxList: a `.map` counter reaches props, text, and attributes per row', async () => {
		const d = await mountDifferential(DEOPT, 'CounterJsxList');
		await d.step('mount', () => {});
		expect(d.octane.container.textContent).toBe('001122');
		d.unmount();
	});

	it('LoopPushedJsxList: a `for` loop reassigning a local and a parameter', async () => {
		const d = await mountDifferential(DEOPT, 'LoopPushedJsxList', { count: 5 });
		await d.step('mount', () => {});
		expect(d.octane.container.textContent).toBe('5row 04row 13row 2');
		d.unmount();
	});

	it('CounterJsxListStateful: re-renders restart the counter; handlers see the live binding', async () => {
		const d = await mountDifferential(DEOPT, 'CounterJsxListStateful');
		const text = (selector: string) => d.octane.container.querySelector(selector)?.textContent;
		await d.step('mount', () => {});
		expect(text('ul')).toBe('12');
		await d.step('handler reads the final value', async (i, r) => {
			await i.click('#seen-a');
			await r.click('#seen-a');
		});
		expect(text('p')).toBe('100');
		await d.step('restart', async (i, r) => {
			await i.click('#restart');
			await r.click('#restart');
		});
		expect(text('ul')).toBe('1112');
		d.unmount();
	});
});
