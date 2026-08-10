import { FontLoader } from 'three-stdlib';

export interface Glyph {
	_cachedOutline: string[];
	ha: number;
	o: string;
}

export interface FontData {
	boundingBox: { yMax: number; yMin: number };
	familyName: string;
	glyphs: { [key: string]: Glyph };
	resolution: number;
	underlineThickness: number;
}

export type FontInput = string | FontData;
let fontLoader: FontLoader | null = null;

async function loadFontData(font: FontInput): Promise<FontData> {
	return typeof font === 'string' ? await (await fetch(font)).json() : font;
}

function parseFontData(fontData: FontData) {
	fontLoader ??= new FontLoader();
	return fontLoader.parse(fontData);
}

export async function loadFont(font: FontInput) {
	return parseFontData(await loadFontData(font));
}
