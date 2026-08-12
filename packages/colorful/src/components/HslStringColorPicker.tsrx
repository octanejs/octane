import { ColorPicker } from './common/ColorPicker.tsrx';
import type { ColorModel, ColorPickerBaseProps } from '../types';
import { equalColorString } from '../utils/compare';
import { hslStringToHsva, hsvaToHslString } from '../utils/convert';

const colorModel: ColorModel<string> = {
	defaultColor: 'hsl(0, 0%, 0%)',
	toHsva: hslStringToHsva,
	fromHsva: hsvaToHslString,
	equal: equalColorString,
};

export const HslStringColorPicker = (props: Partial<ColorPickerBaseProps<string>>) =>
	<ColorPicker {...props} colorModel={colorModel} />;
