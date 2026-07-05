// Ported from .base-ui/packages/react/src/internals/labelable-provider/useLabel.ts. Produces
// a native <label>'s props (`htmlFor` = the control id, `onMouseDown` to avoid text-selection /
// focus the control) or a non-native label's click/pointer props. octane: native events.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { S, splitSlot, subSlot } from '../../internal';
import { getTarget } from '../composite/list-utils';
import { ownerDocument } from '../owner';
import { useRegisteredLabelId } from '../useRegisteredLabelId';
import { useStableCallback } from '../useStableCallback';
import { useLabelableContext } from './LabelableContext';

export interface UseLabelParameters {
	id?: string;
	fallbackControlId?: string | null;
	native?: boolean;
	setLabelId?: (nextLabelId: string | undefined) => void;
	focusControl?: (event: any, controlId: string | null | undefined) => void;
}

function isHTMLElement(el: unknown): el is HTMLElement {
	return el != null && el instanceof HTMLElement;
}

function focusElementWithVisible(element: HTMLElement): void {
	(element as any).focus({ focusVisible: true });
}

export function useLabel(...args: any[]): Record<string, any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useLabel');
	const {
		id: idProp,
		fallbackControlId,
		native = false,
		setLabelId: setLabelIdProp,
		focusControl: focusControlProp,
	} = (user[0] as UseLabelParameters) ?? {};

	const { controlId: contextControlId, setLabelId: setContextLabelId } = useLabelableContext();

	const syncLabelId = useStableCallback(
		(nextLabelId: string | undefined) => {
			setContextLabelId(nextLabelId);
			setLabelIdProp?.(nextLabelId);
		},
		subSlot(slot, 'sync'),
	);

	const id = useRegisteredLabelId(idProp, syncLabelId, subSlot(slot, 'id'));

	const resolvedControlId = contextControlId ?? fallbackControlId;

	function focusControl(event: any): void {
		if (focusControlProp) {
			focusControlProp(event, resolvedControlId);
			return;
		}
		if (!resolvedControlId) {
			return;
		}
		const controlElement = ownerDocument(event.currentTarget).getElementById(resolvedControlId);
		if (isHTMLElement(controlElement)) {
			focusElementWithVisible(controlElement);
		}
	}

	function handleInteraction(event: any): void {
		const target = getTarget(event) as HTMLElement | null;
		if (target?.closest('button,input,select,textarea')) {
			return;
		}
		if (!event.defaultPrevented && event.detail > 1) {
			event.preventDefault();
		}
		if (native) {
			return;
		}
		focusControl(event);
	}

	return native
		? {
				id,
				htmlFor: resolvedControlId ?? undefined,
				onMouseDown: handleInteraction,
			}
		: {
				id,
				onClick: handleInteraction,
				onPointerDown(event: any) {
					event.preventDefault();
				},
			};
}
