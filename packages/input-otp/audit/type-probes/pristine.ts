import type { OTPInputProps, RenderProps, SlotProps } from '../../upstream/npm/dist/index.d.mts';

declare const props: OTPInputProps;
declare const render: RenderProps;
declare const slot: SlotProps;

const maxLength: number = props.maxLength;
const focused: boolean = render.isFocused;
const char: string | null = slot.char;

void [maxLength, focused, char];
