import type { Font } from 'three-stdlib';
import { type FontData, type Glyph, useFont } from '../src/index.js';

const glyph: Glyph = { _cachedOutline: [], ha: 600, o: 'm 0 0' };
const data: FontData = {
	boundingBox: { yMax: 900, yMin: -200 },
	familyName: 'Typed Font',
	glyphs: { A: glyph },
	resolution: 1000,
	underlineThickness: 50,
};
const parsed: Font = useFont(data);
const remote: Font = useFont('/font.typeface.json');
useFont.preload(data);
useFont.clear(data);
void [parsed, remote];

// @ts-expect-error Font input must be a URL or typeface data.
useFont({ familyName: 'incomplete' });
