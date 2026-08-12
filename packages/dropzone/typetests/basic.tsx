import type { DropzoneProps, DropzoneState } from '../src/index.tsrx';

const onDrop: NonNullable<DropzoneProps['onDrop']> = (files) => {
	const accepted: readonly File[] = files;
	console.log(accepted);
};
const children: NonNullable<DropzoneProps['children']> = (state: DropzoneState) => {
	const root = state.getRootProps({ role: 'button', 'aria-label': 'files' });
	const input = state.getInputProps({ required: true, name: 'files' });
	return { root, input };
};
const basic: DropzoneProps = { onDrop, children };
const optional: DropzoneProps = { children };
export { basic, optional };
