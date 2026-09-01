import { useEffect, useState } from '../react-shim.js';
import { getFrame } from './get-frame';

export const useFrame = () => {
	const [el, setEl] = useState<Document>();

	useEffect(() => {
		const frame = getFrame();

		if (frame) {
			setEl(frame);
		}
	}, []);

	return el;
};
