import { createContext } from 'octane/universal/native';
import { type CursorPosition } from '../log-update.js';

export type Props = {
	/**
	Set the cursor position relative to the Ink output.

	Pass `undefined` to hide the cursor.
	*/
	readonly setCursorPosition: (position: CursorPosition | undefined) => void;
};

// eslint-disable-next-line @typescript-eslint/naming-convention
const CursorContext = createContext<Props>({
	setCursorPosition() {},
});

export default CursorContext;
