import * as React from 'react';
import { useMounted } from '~/hooks/useMounted';

export function Mounted({ children }: { children: React.ReactNode }) {
	const mounted = useMounted();

	return <React.Fragment>{mounted ? children : null}</React.Fragment>;
}
