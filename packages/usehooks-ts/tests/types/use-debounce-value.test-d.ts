import { useDebounceValue } from '@octanejs/usehooks-ts';

const [value, controls] = useDebounceValue('initial', 50);
const text: string = value;
controls('next');
void text;

// @ts-expect-error usehooks-ts 3.1.1 requires the debounce delay
useDebounceValue('initial');
