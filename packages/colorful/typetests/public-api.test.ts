import {
	HexAlphaColorPicker,
	HexColorInput,
	HexColorPicker,
	HslColorPicker,
	HslStringColorPicker,
	HslaColorPicker,
	HslaStringColorPicker,
	HsvColorPicker,
	HsvStringColorPicker,
	HsvaColorPicker,
	HsvaStringColorPicker,
	RgbColorPicker,
	RgbStringColorPicker,
	RgbaColorPicker,
	RgbaStringColorPicker,
	setNonce,
	type HslColor,
	type HslaColor,
	type HsvColor,
	type HsvaColor,
	type RgbColor,
	type RgbaColor,
} from '@octanejs/colorful';
import type { HostInputEvent } from './host-input-event';

declare function expectType<T>(value: T): void;

const rgb: RgbColor = { r: 1, g: 2, b: 3 };
const rgba: RgbaColor = { ...rgb, a: 0.5 };
const hsl: HslColor = { h: 1, s: 2, l: 3 };
const hsla: HslaColor = { ...hsl, a: 0.5 };
const hsv: HsvColor = { h: 1, s: 2, v: 3 };
const hsva: HsvaColor = { ...hsv, a: 0.5 };

HexColorPicker({ color: '#fff', onChange: (value: string) => value, id: 'hex', onClick: () => {} });
HexAlphaColorPicker({ color: '#ffffffff', onChangeEnd: (value: string) => value });
HslColorPicker({ color: hsl, onChange: (value: HslColor) => value });
HslaColorPicker({ color: hsla, onChange: (value: HslaColor) => value });
HsvColorPicker({ color: hsv, onChange: (value: HsvColor) => value });
HsvaColorPicker({ color: hsva, onChange: (value: HsvaColor) => value });
RgbColorPicker({ color: rgb, onChange: (value: RgbColor) => value });
RgbaColorPicker({ color: rgba, onChange: (value: RgbaColor) => value });
for (const picker of [
	HslStringColorPicker,
	HslaStringColorPicker,
	HsvStringColorPicker,
	HsvaStringColorPicker,
	RgbStringColorPicker,
	RgbaStringColorPicker,
]) {
	picker({ color: 'rgb(0, 0, 0)', onChange: (value: string) => value });
}
HexColorInput({
	color: '#fff',
	alpha: true,
	prefixed: true,
	onChange: (value: string) => value,
	onInput: (event) => event.currentTarget.value,
	onBlur: () => {},
});
type HexColorInputOnInput = NonNullable<Parameters<typeof HexColorInput>[0]['onInput']>;
type HexColorInputOnInputEvent = Parameters<HexColorInputOnInput>[0];
// OCTANE DIVERGENCE[react-colorful-native-event-attributes]: HostInputEvent is FormEvent here vs InputEvent on Octane.
expectType<HostInputEvent>(null as unknown as HexColorInputOnInputEvent);
setNonce('nonce');

// @ts-expect-error object pickers reject string colors
RgbColorPicker({ color: '#fff' });
// @ts-expect-error alpha is input-only
HexColorPicker({ alpha: true });
// @ts-expect-error HexColorInput callback receives a string
HexColorInput({ onChange: (value: number) => value });
// @ts-expect-error setNonce requires a string
setNonce(123);
