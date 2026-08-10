import { context as threeContext, type RootStore } from '@octanejs/three';
import { createRoot, type OctaneNode } from 'octane';
import type { ScrollControlsState } from './ScrollControls.three.tsrx';

function ScrollHtmlContent({ state, fiberState, children }: {
	state: ScrollControlsState;
	fiberState: RootStore;
	children?: OctaneNode;
}) @{
	<ScrollControlsStateProvider value={state}>
		<threeContext.Provider value={fiberState}>{children}</threeContext.Provider>
	</ScrollControlsStateProvider>
}

// Assigned by ScrollControls to avoid a runtime circular import while preserving context identity.
export let ScrollControlsStateProvider: any;
export function setScrollControlsStateProvider(provider: any): void { ScrollControlsStateProvider = provider; }

export function mountScrollHtml(container: HTMLElement, props: { state: ScrollControlsState; fiberState: RootStore; children?: OctaneNode }): () => void {
	const root = createRoot(container);
	root.render(ScrollHtmlContent, props);
	return () => root.unmount();
}
