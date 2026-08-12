import { context as threeContext, type RootStore } from '@octanejs/three';
import { createRoot, type Context, type OctaneNode } from 'octane';
import type { ScrollControlsState } from './ScrollControls.three.tsrx';

// The Three context is registered with Octane's renderer bridge, so this DOM-owned
// root must expose that same provider through the DOM Context call signature.
const DomThreeContextProvider = threeContext.Provider as unknown as Context<RootStore | null>['Provider'];

function ScrollHtmlContent({ state, fiberState, children }: {
	state: ScrollControlsState;
	fiberState: RootStore;
	children?: OctaneNode;
}) @{
	<ScrollControlsStateProvider value={state}>
		<DomThreeContextProvider value={fiberState}>{children}</DomThreeContextProvider>
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
