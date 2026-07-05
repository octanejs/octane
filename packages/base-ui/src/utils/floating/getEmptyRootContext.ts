// Ported verbatim from .base-ui/packages/react/src/floating-ui-react/utils/getEmptyRootContext.ts.
// The inert root context a popup store starts with before its real one is created.
import { PopupTriggerMap } from '../popups/popupTriggerMap';
import { FloatingRootStore } from './FloatingRootStore';
import type { FloatingRootContext } from './types';

export function getEmptyRootContext(): FloatingRootContext {
	return new FloatingRootStore({
		open: false,
		transitionStatus: undefined,
		floatingElement: null,
		referenceElement: null,
		triggerElements: new PopupTriggerMap(),
		floatingId: undefined,
		syncOnly: false,
		nested: false,
		onOpenChange: undefined,
	});
}
