import { AlphaColorPicker } from './common/AlphaColorPicker.tsrx';
import type { ColorModel, ColorPickerBaseProps } from '../types';
import { equalHex } from '../utils/compare';
import { hexToHsva, hsvaToHex } from '../utils/convert';

const colorModel: ColorModel<string> = {
	defaultColor: '0001',
	toHsva: hexToHsva,
	fromHsva: hsvaToHex,
	equal: equalHex,
};

export const HexAlphaColorPicker = (props: Partial<ColorPickerBaseProps<string>>) =>
	<AlphaColorPicker {...props} colorModel={colorModel} />;
