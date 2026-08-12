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
} from '@octanejs/colorful';

export function HexHarness(props: any) {
	return <HexColorPicker {...props} />;
}

export function AlphaHarness(props: any) {
	return <HexAlphaColorPicker {...props} />;
}

export function HsvaHarness(props: any) {
	return <HsvaColorPicker {...props} />;
}

export function RgbaHarness(props: any) {
	return <RgbaColorPicker {...props} />;
}

export function HslStringHarness(props: any) {
	return <HslStringColorPicker {...props} />;
}

export function HslaStringHarness(props: any) {
	return <HslaStringColorPicker {...props} />;
}

export function HsvaStringHarness(props: any) {
	return <HsvaStringColorPicker {...props} />;
}

export function RgbaStringHarness(props: any) {
	return <RgbaStringColorPicker {...props} />;
}

export function InputHarness(props: any) {
	return <HexColorInput {...props} />;
}

export function AllPickers() {
	return <div data-testid="all-pickers">
		<HexColorPicker />
		<HexAlphaColorPicker />
		<HslColorPicker />
		<HslaColorPicker />
		<HslStringColorPicker />
		<HslaStringColorPicker />
		<HsvColorPicker />
		<HsvaColorPicker />
		<HsvStringColorPicker />
		<HsvaStringColorPicker />
		<RgbColorPicker />
		<RgbaColorPicker />
		<RgbStringColorPicker />
		<RgbaStringColorPicker />
	</div>;
}
