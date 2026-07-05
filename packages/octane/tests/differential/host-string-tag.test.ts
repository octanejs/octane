import { describe, it } from 'vitest';
import { mountDifferential } from './_rig.js';
import { resolve } from 'node:path';

// Differential pin for JSX tags that resolve to a HOST tag STRING at runtime
// (`<Tag/>` with `const Tag = 'h1'`, `<props.parts.title>`). React renders
// these natively (createElement('h1')); Octane routes them through
// componentSlot's string-comp branch → the de-opt host renderer. The DOM must
// match byte-for-byte across mount, in-place updates, and tag flips.

const FIXTURE = resolve(__dirname, '../_fixtures/host-string-tag-diff.tsrx');

describe('differential: host-string-tag-diff.tsrx', () => {
	it('TagSwitcher: mount, update in place, flip tag, update again', async () => {
		const d = await mountDifferential(FIXTURE, 'TagSwitcher');
		await d.step('mount (h1, n:0)', () => {});
		await d.step('bump → n:1 patched in place', async (i, r) => {
			await i.click('#bump');
			await r.click('#bump');
		});
		await d.step('flip → h2 replaces h1', async (i, r) => {
			await i.click('#flip');
			await r.click('#flip');
		});
		await d.step('bump after flip → h2 patched', async (i, r) => {
			await i.click('#bump');
			await r.click('#bump');
		});
		await d.step('flip back → h1', async (i, r) => {
			await i.click('#flip');
			await r.click('#flip');
		});
		d.unmount();
	});

	it('MemberTag: member-expression tag renders the host element', async () => {
		const d = await mountDifferential(FIXTURE, 'MemberTag', {
			parts: { title: 'h3' },
			text: 'Hi',
		});
		await d.step('mount (h3)', () => {});
		d.unmount();
	});
});
