import { HexColorPicker } from '@octanejs/colorful';

export function HydrationHex(props: any) {
	return <HexColorPicker color="#ff0000" onChange={props.onChange} data-testid="hex" />;
}
