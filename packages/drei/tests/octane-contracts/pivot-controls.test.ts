import { describe, expect, it } from 'vitest';
import { PivotControls } from '../../src/web/pivotControls/index.three.tsrx';

describe('PivotControls (Octane-only contracts)', () => {
	it('exports the public runtime and props family', function () {
		expect(PivotControls).toBeTypeOf('function');
	});
});
