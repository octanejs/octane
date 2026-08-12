// Public declaration companion for index.tsrx. The runtime implementation also
// accepts the compiler-owned trailing hook slot, but that is not part of the
// upstream-compatible user API.
import type { DropzoneOptions, DropzoneProps, DropzoneState } from './types.ts';
import type { Octane } from 'octane/jsx-runtime';

export type {
	Accept,
	AcceptGroup,
	DropEvent,
	DropzoneInputProps,
	DropzoneOptions,
	DropzoneProps,
	DropzoneRef,
	DropzoneRootProps,
	DropzoneState,
	FileError,
	FileRejection,
	FileWithPath,
	ValidatorResult,
} from './types.ts';
export { ErrorCode } from './utils/index.ts';

export default function Dropzone(props: DropzoneProps): Octane.JSX.Element;
export declare function useDropzone(props?: DropzoneOptions): DropzoneState;
