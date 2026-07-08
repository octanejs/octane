/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/recharts
 * (octane) AND real recharts (the setup rewrites the import specifiers). The
 * emitted SVG — Surface/Layer structure, every shape's path data, attributes —
 * must be byte-identical. Charts are pure markup, which makes recharts the
 * ideal subject for this rig.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/shapes.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/recharts vs real recharts (Phase 0 shapes)', () => {
	it('Surface + Layer + Rectangle/Dot/Cross/Polygon render byte-identical SVG', async () => {
		const d = await mountDifferential(FIXTURE, 'ShapesApp', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
});
