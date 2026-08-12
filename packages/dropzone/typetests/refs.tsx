import type { DropzoneProps, DropzoneRef } from '../src/index.tsrx';

const ref: { current: DropzoneRef | null } = { current: null };
const callbackRef = (value: DropzoneRef | null) => {
	if (value) value.open();
};
const objectRefProps: DropzoneProps = { ref };
const callbackRefProps: DropzoneProps = { ref: callbackRef };
ref.current?.open();
export { callbackRefProps, objectRefProps, ref };
