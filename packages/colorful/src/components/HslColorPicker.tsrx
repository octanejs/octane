import { ColorPicker } from './common/ColorPicker.tsrx';
import type { ColorModel, ColorPickerBaseProps, HslColor } from '../types';
import { equalColorObjects } from '../utils/compare';
import { hslaToHsva, hsvaToHsla, hslaToHsl } from '../utils/convert';

const colorModel: ColorModel<HslColor> = {
	defaultColor: { h: 0, s: 0, l: 0 },
	toHsva: ({ h, s, l }) => hslaToHsva({ h, s, l, a: 1 }),
	fromHsva: (hsva) => hslaToHsl(hsvaToHsla(hsva)),
	equal: equalColorObjects,
};

export const HslColorPicker = (props: Partial<ColorPickerBaseProps<HslColor>>) =>
	<ColorPicker {...props} colorModel={colorModel} />;
