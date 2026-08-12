import { describe, it } from 'vitest';
import { mountDifferential, preloadDifferentialFixture } from './_rig.js';
import { resolve } from 'node:path';

// React is the oracle for `{cond ? A : B}` child holes where exactly ONE arm
// is a JSX literal: the other arm's value (keyed `.map` array, string,
// variable-held element, nested ternary, falsy primitive, `null`/`undefined`)
// must render identically on every toggle. The regression rendered the
// non-JSX arm as an empty hole; a `null` consequent didn't compile at all.
const FIXTURE = resolve(__dirname, '../_fixtures/ternary-mixed-arms.tsrx');

await preloadDifferentialFixture(FIXTURE);

describe('differential: ternary-mixed-arms.tsrx — one JSX arm, one value arm', () => {
	it('MapArm: keyed `.map` array ⇄ component stays byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'MapArm');
		await d.step('mount (array arm)', () => {});
		await d.step('to component arm', async (i, r) => {
			await i.click('.next');
			await r.click('.next');
		});
		await d.step('back to array arm', async (i, r) => {
			await i.click('.next');
			await r.click('.next');
		});
		d.unmount();
	});

	it('StringArm: string ⇄ element', async () => {
		const d = await mountDifferential(FIXTURE, 'StringArm');
		await d.step('mount (string arm)', () => {});
		await d.step('to element', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		await d.step('back to string', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		d.unmount();
	});

	it('VarArm: variable-held element ⇄ literal element', async () => {
		const d = await mountDifferential(FIXTURE, 'VarArm');
		await d.step('mount (variable arm)', () => {});
		await d.step('to literal element', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		await d.step('back to variable arm', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		d.unmount();
	});

	it('NestedTernary: chain walks every level including the 0 tail', async () => {
		const d = await mountDifferential(FIXTURE, 'NestedTernary');
		await d.step('mount (0 tail)', () => {});
		for (const name of ['first arm', 'middle arm', 'tail again']) {
			await d.step(name, async (i, r) => {
				await i.click('.next');
				await r.click('.next');
			});
		}
		d.unmount();
	});

	it('NullConsequent: null arm ⇄ element', async () => {
		const d = await mountDifferential(FIXTURE, 'NullConsequent');
		await d.step('mount (null arm)', () => {});
		await d.step('to element', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		await d.step('back to null', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		d.unmount();
	});

	it('UndefinedArm: undefined arm ⇄ element', async () => {
		const d = await mountDifferential(FIXTURE, 'UndefinedArm');
		await d.step('mount (undefined arm)', () => {});
		await d.step('to element', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		await d.step('back to undefined', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		d.unmount();
	});

	it('ChildrenArm: ternary as component children stays byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ChildrenArm');
		await d.step('mount (string arm)', () => {});
		await d.step('to element', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		await d.step('back to string', async (i, r) => {
			await i.click('.flip');
			await r.click('.flip');
		});
		d.unmount();
	});

	it('AndArm: `&&` arm through truthy, JSX, and false states', async () => {
		const d = await mountDifferential(FIXTURE, 'AndArm');
		await d.step('mount (true && element)', () => {});
		for (const name of ['jsx arm', 'jsx arm again', 'false && element']) {
			await d.step(name, async (i, r) => {
				await i.click('.next');
				await r.click('.next');
			});
		}
		d.unmount();
	});
});
