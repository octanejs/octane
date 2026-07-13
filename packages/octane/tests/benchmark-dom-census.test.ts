import { describe, expect, it } from 'vitest';
import { censusDomNodes } from '../../../benchmarks/lib/dom-nodes.mjs';

describe('benchmark DOM census — counted hydration markers', () => {
	it('counts legacy and N >= 2 forms while ignoring numeric multiplicity one', () => {
		const root = document.createElement('div');
		root.id = 'marker-census';
		document.body.appendChild(root);
		try {
			for (const data of ['[', ']', '[2', ']2', '[1', ']1']) {
				root.appendChild(document.createComment(data));
			}
			const census = censusDomNodes('#marker-census');
			expect(census.hydrationMarkersPhysical).toBe(4);
			expect(census.hydrationMarkersLogical).toBe(6);
			expect(census.hydrationMarkersCounted).toBe(2);
			expect(census.hydrationMarkerMaxMultiplicity).toBe(2);
		} finally {
			root.remove();
		}
	});
});
