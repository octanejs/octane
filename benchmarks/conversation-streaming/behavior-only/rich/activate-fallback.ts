import { activate as activateBindings } from './activate.tsrx';

// Measurement control: choose before either presentation claims the DOM. The
// query flag simulates a rejected eligibility proof; it is not such a proof.
// In particular, an exception after adoption begins is not safe to catch here.
const useRenderer = new URL(location.href).searchParams.get('rendererFallback') === '1';
export const activate = useRenderer
	? (await import('./activate-renderer.ts')).activate
	: activateBindings;
