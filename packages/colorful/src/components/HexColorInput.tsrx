import { useCallback } from 'octane';
import type { ColorInputBaseProps } from '../types';
import { validHex } from '../utils/validate';
import { ColorInput } from './common/ColorInput.tsrx';

export interface HexColorInputProps extends ColorInputBaseProps {
	prefixed?: boolean;
	alpha?: boolean;
}

const prefix = (value: string) => '#' + value;

export const HexColorInput = ({ prefixed, alpha, ...rest }: HexColorInputProps) => {
	const escape = useCallback(
		(value: string) => value.replace(/([^0-9A-F]+)/gi, '').substring(0, alpha ? 8 : 6),
		[alpha],
	);
	const validate = useCallback((value: string) => validHex(value, alpha), [alpha]);
	return <ColorInput
		{...rest}
		escape={escape}
		format={prefixed ? prefix : undefined}
		process={prefix}
		validate={validate}
	/>;
};
