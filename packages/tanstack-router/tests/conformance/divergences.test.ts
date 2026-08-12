import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('@octanejs/tanstack-router documented divergences', () => {
	// Octane framework contract: React Router devtools are not published here.
	// @parity-case adapted:tanstack-router-separate-devtools
	it('does not publish the separately distributed React devtools', () => {
		expect(packageJson.exports).not.toHaveProperty('./devtools');
		expect(Object.keys(packageJson.dependencies)).not.toContain('@tanstack/react-router-devtools');
	});
});
