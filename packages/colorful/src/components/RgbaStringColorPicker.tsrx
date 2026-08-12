import { AlphaColorPicker } from './common/AlphaColorPicker.tsrx';
import type { ColorModel, ColorPickerBaseProps } from '../types';
import { equalColorString } from '../utils/compare';
import { rgbaStringToHsva, hsvaToRgbaString } from '../utils/convert';

const colorModel: ColorModel<string> = {
	defaultColor: 'rgba(0, 0, 0, 1)',
	toHsva: rgbaStringToHsva,
	fromHsva: hsvaToRgbaString,
	equal: equalColorString,
};

export const RgbaStringColorPicker = (props: Partial<ColorPickerBaseProps<string>>) =>
	<AlphaColorPicker {...props} colorModel={colorModel} />;
