import { describe, expect, it } from 'vitest';

import {
	assertReactAriaComponentsExports,
	auditReactAriaComponentsExports,
} from '../scripts/check-react-aria-components-exports.mjs';

describe('react-aria-components public exports', () => {
	it('matches every runtime and type export from the pinned upstream package', () => {
		let result = assertReactAriaComponentsExports();

		expect(result).toMatchObject({
			version: '1.19.0',
			runtime: { upstream: 280, local: 280, missing: [], extra: [] },
			types: { upstream: 313, local: 313, missing: [], extra: [] },
		});
	});

	it('reports the two public lanes independently', () => {
		let result = auditReactAriaComponentsExports();

		expect(result.runtime.local).toBe(result.runtime.upstream);
		expect(result.types.local).toBe(result.types.upstream);
	});
});
