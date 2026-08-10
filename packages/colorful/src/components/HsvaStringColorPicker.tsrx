import { AlphaColorPicker } from './common/AlphaColorPicker.tsrx';
import type { ColorModel, ColorPickerBaseProps } from '../types';
import { equalColorString } from '../utils/compare';
import { hsvaStringToHsva, hsvaToHsvaString } from '../utils/convert';

const colorModel: ColorModel<string> = {
	defaultColor: 'hsva(0, 0%, 0%, 1)',
	toHsva: hsvaStringToHsva,
	fromHsva: hsvaToHsvaString,
	equal: equalColorString,
};

export const HsvaStringColorPicker = (props: Partial<ColorPickerBaseProps<string>>) =>
	<AlphaColorPicker {...props} colorModel={colorModel} />;
