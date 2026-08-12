import { expect, it } from 'vitest';
import * as ReactColorful from '@octanejs/colorful';

// Octane-only public-export smoke — not an upstream suite identity.
it('exports the exact upstream runtime surface', function exportsExactSurface() {
	expect(Object.keys(ReactColorful).sort()).toEqual(
		[
			'HexAlphaColorPicker',
			'HexColorInput',
			'HexColorPicker',
			'HslColorPicker',
			'HslStringColorPicker',
			'HslaColorPicker',
			'HslaStringColorPicker',
			'HsvColorPicker',
			'HsvStringColorPicker',
			'HsvaColorPicker',
			'HsvaStringColorPicker',
			'RgbColorPicker',
			'RgbStringColorPicker',
			'RgbaColorPicker',
			'RgbaStringColorPicker',
			'setNonce',
		].sort(),
	);
});
