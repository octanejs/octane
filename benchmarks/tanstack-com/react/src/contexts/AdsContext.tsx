import * as React from 'react';
import { useAdsPreference } from '~/stores/userSettings';

export function AdGate({ children }: { children: React.ReactNode }) {
	const { adsEnabled } = useAdsPreference();
	return adsEnabled ? <>{children}</> : null;
}
