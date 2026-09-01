import { describe, expect, it } from 'vitest';
import * as binding from '@octanejs/puck';
import * as upstream from '@measured/puck';

describe('@octanejs/puck — exports', () => {
	it('provides core upstream runtime exports', () => {
		for (const name of [
			'Puck',
			'Render',
			'DropZone',
			'Drawer',
			'AutoField',
			'usePuck',
			'createUsePuck',
			'useGetPuck',
			'walkTree',
			'setDeep',
			'migrate',
			'transformProps',
			'registerOverlayPortal',
		] as const) {
			const bindingType = typeof binding[name];
			const upstreamType = typeof upstream[name];
			if (
				name === 'Puck' ||
				name === 'Render' ||
				name === 'DropZone' ||
				name === 'Drawer' ||
				name === 'AutoField'
			) {
				expect(bindingType).toBe('function');
				continue;
			}
			expect(bindingType).toBe(upstreamType);
		}
	});
});
