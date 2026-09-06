/** @jsxImportSource octane */
'use client';
import type * as React from 'octane';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';
import { useBaseUiId } from '../internals/useBaseUiId';

export function useRegisteredLabelId(
	idProp: string | undefined,
	setLabelId: React.Dispatch<React.SetStateAction<string | undefined>>,
): string | undefined {
	const id = useBaseUiId(idProp);

	useIsoLayoutEffect(() => {
		setLabelId(id);
		return () => {
			setLabelId((currentId) => (currentId === id ? undefined : currentId));
		};
	}, [id, setLabelId]);

	return id;
}
