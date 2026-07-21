import { useAdsPreference } from '~/stores/userSettings';

export function AdGate({ children }: { children?: any }) {
	const { adsEnabled } = useAdsPreference();
	return adsEnabled
		? <>
				{children}
			</>
		: null;
}
