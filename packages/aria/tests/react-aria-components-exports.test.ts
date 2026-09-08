import { describe, expect, it } from 'vitest';

import {
	assertReactAriaComponentsExports,
	auditReactAriaComponentsExports,
} from '../scripts/check-react-aria-components-exports.mjs';

describe('react-aria-components public exports', () => {
	it('matches every runtime and type export from the pinned upstream package', () => {
		let result = assertReactAriaComponentsExports();

		expect(result).toMatchObject({
			version: '1.20.0',
			runtime: { upstream: 286, local: 286, missing: [], extra: [] },
			types: { upstream: 327, local: 327, missing: [], extra: [] },
		});
	});

	it('reports the two public lanes independently', () => {
		let result = auditReactAriaComponentsExports();

		expect(result.runtime.local).toBe(result.runtime.upstream);
		expect(result.types.local).toBe(result.types.upstream);
	});
});
