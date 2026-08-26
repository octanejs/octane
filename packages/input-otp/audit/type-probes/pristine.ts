import type {
	OTPInputProps,
	RenderProps,
	SlotProps,
} from '../../upstream-artifact/dist/index.d.mts';

declare const props: OTPInputProps;
declare const render: RenderProps;
declare const slot: SlotProps;

const maxLength: number = props.maxLength;
const focused: boolean = render.isFocused;
const char: string | null = slot.char;
const nonce: string | undefined = props.nonce;

void [maxLength, focused, char, nonce];
