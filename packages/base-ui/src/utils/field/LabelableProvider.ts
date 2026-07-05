// Ported from .base-ui/packages/react/src/internals/labelable-provider/LabelableProvider.tsx.
// Provides the REAL LabelableContext (control-id registry, labelId, message ids for
// aria-describedby) that Field parts read — overriding the inert default context.
import { createElement, useCallback, useContext, useMemo, useState } from 'octane';

import { S, subSlot } from '../../internal';
import { useBaseUiId } from '../useBaseUiId';
import { useRefWithInit } from '../useRefWithInit';
import { useStableCallback } from '../useStableCallback';
import { LabelableContext, type LabelableContextValue } from './LabelableContext';

export interface LabelableProviderProps {
	controlId?: string | null;
	labelId?: string;
	children?: any;
}

export function LabelableProvider(props: LabelableProviderProps): any {
	const slot = S('LabelableProvider');
	const defaultId = useBaseUiId(undefined, subSlot(slot, 'default'));
	const initialControlId = props.controlId === undefined ? defaultId : props.controlId;

	const [controlId, setControlIdState] = useState<string | null | undefined>(
		initialControlId,
		subSlot(slot, 'controlId'),
	);
	const [labelId, setLabelId] = useState<string | undefined>(
		props.labelId,
		subSlot(slot, 'labelId'),
	);
	const [messageIds, setMessageIds] = useState<string[]>([], subSlot(slot, 'messageIds'));

	const registrationsRef = useRefWithInit<Map<symbol, string | null>>(
		() => new Map(),
		subSlot(slot, 'reg'),
	);

	const { messageIds: parentMessageIds } = useContext(LabelableContext);

	const registerControlId = useStableCallback(
		(source: symbol, nextId: string | null | undefined) => {
			const registrations = registrationsRef.current;
			if (nextId === undefined) {
				registrations.delete(source);
				return;
			}
			registrations.set(source, nextId);
			setControlIdState((prev: string | null | undefined) => {
				if (registrations.size === 0) {
					return undefined;
				}
				let nextControlId: string | null | undefined;
				for (const id of registrations.values()) {
					if (prev !== undefined && id === prev) {
						return prev;
					}
					if (nextControlId === undefined) {
						nextControlId = id;
					}
				}
				return nextControlId;
			});
		},
		subSlot(slot, 'registerControlId'),
	);

	const getDescriptionProps = useCallback(
		(externalProps: Record<string, any>) => {
			const ids = externalProps['aria-describedby']
				? externalProps['aria-describedby'].split(' ')
				: [];
			ids.push(...parentMessageIds, ...messageIds);
			return {
				...externalProps,
				'aria-describedby': Array.from(new Set(ids)).join(' ') || undefined,
			};
		},
		[parentMessageIds, messageIds],
		subSlot(slot, 'getDesc'),
	);

	const contextValue: LabelableContextValue = useMemo(
		() => ({
			controlId,
			registerControlId,
			labelId,
			setLabelId,
			messageIds,
			setMessageIds,
			getDescriptionProps,
		}),
		[
			controlId,
			registerControlId,
			labelId,
			setLabelId,
			messageIds,
			setMessageIds,
			getDescriptionProps,
		],
		subSlot(slot, 'ctx'),
	);

	return createElement(LabelableContext.Provider, {
		value: contextValue,
		children: props.children,
	});
}
