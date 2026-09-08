'use client';
import * as React from 'octane';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';
import { useStableCallback } from '@octanejs/base-ui-utils/useStableCallback';

interface ClosePartContextValue {
	register: () => () => void;
}

export const ClosePartContext = React.createContext<ClosePartContextValue | undefined>(undefined);

export function useClosePartCount() {
	const [closePartCount, setClosePartCount] = React.useState(0);

	const register = useStableCallback(() => {
		setClosePartCount((count) => count + 1);

		return () => {
			setClosePartCount((count) => Math.max(0, count - 1));
		};
	});

	const context = React.useMemo(() => ({ register }), [register]);

	return {
		context,
		hasClosePart: closePartCount > 0,
	};
}

export function useClosePartRegistration() {
	const context = React.useContext(ClosePartContext);

	useIsoLayoutEffect(() => {
		return context?.register();
	}, [context]);
}
