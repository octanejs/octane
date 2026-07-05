// Ported from .base-ui/packages/react/src/internals/labelable-provider/useLabelableId.ts.
// Resolves a control's id and registers it with the LabelableProvider (noop when standalone —
// `registerControlId === NOOP` — where it simply returns a generated id).
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useEffect, useLayoutEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { NOOP } from '../noop';
import { useBaseUiId } from '../useBaseUiId';
import { useRefWithInit } from '../useRefWithInit';
import { useStableCallback } from '../useStableCallback';
import { useLabelableContext } from './LabelableContext';

export interface UseLabelableIdParameters {
	id?: string;
	implicit?: boolean;
	controlRef?: { current: HTMLElement | null };
}

function isElement(el: unknown): el is Element {
	return el != null && el instanceof Element;
}

export function useLabelableId(...args: any[]): string | undefined {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useLabelableId');
	const { id, implicit = false, controlRef } = (user[0] as UseLabelableIdParameters) ?? {};

	const { controlId, registerControlId } = useLabelableContext();

	const defaultId = useBaseUiId(id, subSlot(slot, 'def'));
	const controlIdForEffect = implicit ? controlId : undefined;

	const controlSourceRef = useRefWithInit<symbol>(
		() => Symbol('labelable-control'),
		subSlot(slot, 'src'),
	);
	const hasRegisteredRef = useRef(false, subSlot(slot, 'has'));
	const hadExplicitIdRef = useRef(id != null, subSlot(slot, 'had'));

	const unregisterControlId = useStableCallback(
		() => {
			if (!hasRegisteredRef.current || registerControlId === NOOP) {
				return;
			}
			hasRegisteredRef.current = false;
			registerControlId(controlSourceRef.current, undefined);
		},
		subSlot(slot, 'unreg'),
	);

	useLayoutEffect(
		() => {
			if (registerControlId === NOOP) {
				return undefined;
			}
			let nextId: string | null | undefined;
			if (implicit) {
				const elem = controlRef?.current;
				if (isElement(elem) && elem.closest('label') != null) {
					nextId = id ?? null;
				} else {
					nextId = controlIdForEffect ?? defaultId;
				}
			} else if (id != null) {
				hadExplicitIdRef.current = true;
				nextId = id;
			} else if (hadExplicitIdRef.current) {
				nextId = defaultId;
			} else {
				unregisterControlId();
				return undefined;
			}
			if (nextId === undefined) {
				unregisterControlId();
				return undefined;
			}
			hasRegisteredRef.current = true;
			registerControlId(controlSourceRef.current, nextId);
			return undefined;
		},
		[
			id,
			controlRef,
			controlIdForEffect,
			registerControlId,
			implicit,
			defaultId,
			controlSourceRef,
			unregisterControlId,
		],
		subSlot(slot, 'e:reg'),
	);

	useEffect(() => unregisterControlId, [unregisterControlId], subSlot(slot, 'e:cleanup'));

	return controlId ?? defaultId;
}
