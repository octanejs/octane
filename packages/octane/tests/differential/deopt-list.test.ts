import { describe, it } from 'vitest';
import { mountDifferential } from './_rig.js';
import { resolve } from 'node:path';

// The de-opt path with React as the byte-for-byte oracle: the SAME `.tsrx` runs
// through Octane AND @tsrx/react. `createElement` resolves to Octane's de-opt
// element on the Octane side and to React.createElement on the React side, so a
// pass proves Octane's runtime array-child reconciliation matches React's.
const DEOPT = resolve(__dirname, '../_fixtures/deopt-list.tsrx');

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
