import type { AnalyticsProvider } from '../types';

declare global {
	interface Window {
		dataLayer: unknown[] | undefined;
		gtag: ((...args: unknown[]) => void) | undefined;
	}
}

export const googleAnalyticsProvider: AnalyticsProvider = {
	trackEvent(event, properties) {
		if (typeof window === 'undefined' || !window.gtag) {
			return;
		}

		window.gtag('event', event, properties);
	},
};
