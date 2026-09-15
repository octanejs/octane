import * as Colorful from 'react-colorful';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';
type HslColorShape = Assert<Equal<Colorful.HslColor, { h: number; s: number; l: number }>>;
type HslaColorShape = Assert<
	Equal<Colorful.HslaColor, { h: number; s: number; l: number; a: number }>
>;
type HsvColorShape = Assert<Equal<Colorful.HsvColor, { h: number; s: number; v: number }>>;
type HsvaColorShape = Assert<
	Equal<Colorful.HsvaColor, { h: number; s: number; v: number; a: number }>
>;
type RgbColorShape = Assert<Equal<Colorful.RgbColor, { r: number; g: number; b: number }>>;
type RgbaColorShape = Assert<
	Equal<Colorful.RgbaColor, { r: number; g: number; b: number; a: number }>
>;
type HexAlphaColorPickerColor = Assert<
	Equal<NonNullable<Parameters<typeof Colorful.HexAlphaColorPicker>[0]['color']>, string>
>;
type HexColorInputColor = Assert<
	Equal<NonNullable<Parameters<typeof Colorful.HexColorInput>[0]['color']>, string>
>;
type HexColorPickerColor = Assert<
	Equal<NonNullable<Parameters<typeof Colorful.HexColorPicker>[0]['color']>, string>
>;
type HslColorPickerColor = Assert<
	Equal<
		NonNullable<Parameters<typeof Colorful.HslColorPicker>[0]['color']>,
		{ h: number; s: number; l: number }
	>
>;
type HslStringColorPickerColor = Assert<
	Equal<NonNullable<Parameters<typeof Colorful.HslStringColorPicker>[0]['color']>, string>
>;
type HslaColorPickerColor = Assert<
	Equal<
		NonNullable<Parameters<typeof Colorful.HslaColorPicker>[0]['color']>,
		{ h: number; s: number; l: number; a: number }
	>
>;
type HslaStringColorPickerColor = Assert<
	Equal<NonNullable<Parameters<typeof Colorful.HslaStringColorPicker>[0]['color']>, string>
>;
type HsvColorPickerColor = Assert<
	Equal<
		NonNullable<Parameters<typeof Colorful.HsvColorPicker>[0]['color']>,
		{ h: number; s: number; v: number }
	>
>;
type HsvStringColorPickerColor = Assert<
	Equal<NonNullable<Parameters<typeof Colorful.HsvStringColorPicker>[0]['color']>, string>
>;
type HsvaColorPickerColor = Assert<
	Equal<
		NonNullable<Parameters<typeof Colorful.HsvaColorPicker>[0]['color']>,
		{ h: number; s: number; v: number; a: number }
	>
>;
type HsvaStringColorPickerColor = Assert<
	Equal<NonNullable<Parameters<typeof Colorful.HsvaStringColorPicker>[0]['color']>, string>
>;
type RgbColorPickerColor = Assert<
	Equal<
		NonNullable<Parameters<typeof Colorful.RgbColorPicker>[0]['color']>,
		{ r: number; g: number; b: number }
	>
>;
type RgbStringColorPickerColor = Assert<
	Equal<NonNullable<Parameters<typeof Colorful.RgbStringColorPicker>[0]['color']>, string>
>;
type RgbaColorPickerColor = Assert<
	Equal<
		NonNullable<Parameters<typeof Colorful.RgbaColorPicker>[0]['color']>,
		{ r: number; g: number; b: number; a: number }
	>
>;
type RgbaStringColorPickerColor = Assert<
	Equal<NonNullable<Parameters<typeof Colorful.RgbaStringColorPicker>[0]['color']>, string>
>;
type NonceSignature = Assert<Equal<typeof Colorful.setNonce, (nonce: string) => void>>;
// @ts-expect-error RGB pickers reject a string color.
Colorful.RgbColorPicker({ color: '#fff' });
// @ts-expect-error Alpha is an input-only property.
Colorful.HexColorPicker({ alpha: true });
// @ts-expect-error The color callback receives a string.
Colorful.HexColorInput({ onChange: (color: number) => color });
// @ts-expect-error A nonce must be a string.
Colorful.setNonce(123);
