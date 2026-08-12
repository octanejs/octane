import type { DropzoneProps, DropzoneState } from '../src/index.tsrx';
import { useDropzone } from '../src/index.tsrx';

export function useHookDropzone(options: DropzoneProps): DropzoneState {
	return useDropzone(options);
}

const renderState = (state: DropzoneState) => ({
	root: state.getRootProps(),
	input: state.getInputProps(),
	open: state.open,
});
export { renderState };
