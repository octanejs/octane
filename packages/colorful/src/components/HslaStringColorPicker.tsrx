import { AlphaColorPicker } from './common/AlphaColorPicker.tsrx';
import type { ColorModel, ColorPickerBaseProps } from '../types';
import { equalColorString } from '../utils/compare';
import { hslaStringToHsva, hsvaToHslaString } from '../utils/convert';

const colorModel: ColorModel<string> = {
	defaultColor: 'hsla(0, 0%, 0%, 1)',
	toHsva: hslaStringToHsva,
	fromHsva: hsvaToHslaString,
	equal: equalColorString,
};

export const HslaStringColorPicker = (props: Partial<ColorPickerBaseProps<string>>) =>
	<AlphaColorPicker {...props} colorModel={colorModel} />;
