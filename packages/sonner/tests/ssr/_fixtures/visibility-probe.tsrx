import { useIsDocumentHidden } from '../../../src/hooks.tsrx';

// SSR probe for divergence note (sonner-ssr-visibility-guard): toast items call
// this hook, and an empty Toaster never mounts them. Render the hook directly so
// server rendering authenticates the guarded document.hidden read.
export function VisibilityProbe() {
	const isDocumentHidden = useIsDocumentHidden();
	return <p data-document-hidden={String(isDocumentHidden)}>visibility probe</p>;
}
