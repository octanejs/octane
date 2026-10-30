// The pinned helpers/testingLibrary.ts renders through two modules of
// @testing-library/react-native, which wrap react-test-renderer. React Native itself is
// outside this web port, so the pristine lane supplies those two entry points over
// react-test-renderer directly.
import type { ReactElement } from 'react';
import { act as reactAct, create } from 'react-test-renderer';

export default function act(callback: () => void) {
	reactAct(callback);
}

export function renderWithAct(component: ReactElement, options?: Parameters<typeof create>[1]) {
	let renderer!: ReturnType<typeof create>;
	reactAct(() => {
		renderer = create(component, options);
	});
	return renderer;
}
