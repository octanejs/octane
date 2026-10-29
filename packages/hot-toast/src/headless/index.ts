// Ported unchanged from react-hot-toast@2.6.1 src/headless/index.ts
// (https://github.com/timolins/react-hot-toast/tree/v2.6.1).
//
// OCTANE DIVERGENCE[shared-headless-store][conformance:hot-toast-shared-headless-store]:
// upstream bundles this entry separately, with its own copy of the store. The
// port publishes its source, so this entry and the root share one store.
import { toast } from '../core/toast';

export type {
	DefaultToastOptions,
	IconTheme,
	Renderable,
	Toast,
	ToasterProps,
	ToastOptions,
	ToastPosition,
	ToastType,
	ValueFunction,
	ValueOrFunction,
} from '../core/types';

export { resolveValue } from '../core/types';
export { useToaster } from '../core/use-toaster';
export { useStore as useToasterStore } from '../core/store';

export { toast };
export default toast;
