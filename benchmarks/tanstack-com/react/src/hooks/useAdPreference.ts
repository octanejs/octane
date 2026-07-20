import { useCurrentUserQuery } from './useCurrentUser';
import { useCapabilities } from './useCapabilities';
import { hasCapability } from '~/db/types';
import * as React from 'react';

const STORAGE_KEY = 'tanstack-ads-preference';

function getStoredPreference(): boolean | null {
	if (typeof window === 'undefined') return null;
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === null ? null : stored === 'true';
}

// Legacy hook for backward compatibility - now uses current user query
export function useAdsPreference() {
	const userQuery = useCurrentUserQuery();
	const capabilities = useCapabilities();
	const [storedPreference] = React.useState(() => getStoredPreference());

	let adsEnabled: boolean;

	if (userQuery.isLoading || !userQuery.data) {
		adsEnabled = storedPreference ?? true;
	} else {
		const user = userQuery.data;
		const adsDisabled = user.adsDisabled ?? false;
		const canDisableAds = hasCapability(capabilities, 'disableAds');
		adsEnabled = !canDisableAds || !adsDisabled;
	}

	// Save to localStorage when we have resolved data
	React.useEffect(() => {
		if (!userQuery.isLoading && userQuery.data && typeof window !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, String(adsEnabled));
		}
	}, [userQuery.isLoading, userQuery.data, adsEnabled]);

	return { adsEnabled };
}
