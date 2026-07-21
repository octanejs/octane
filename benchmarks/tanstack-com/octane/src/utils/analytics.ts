import * as React from 'octane';
import { googleAnalyticsProvider } from './analytics/providers/google';
import type { AnalyticsEventName, AnalyticsEventProps } from './analytics/events';
import type { AnalyticsPropertyValue, EventPayload } from './analytics/types';

export type {
	AnalyticsEvent,
	AnalyticsEventName,
	AnalyticsEventProps,
	BuilderAction,
	BuilderFailureStage,
	BuilderMode,
	BuilderSessionContext,
	BuilderSurface,
	PartnerClickDestination,
	PartnerFilterChange,
	PartnerPlacement,
} from './analytics/events';
export { defaultBuilderSessionContext } from './analytics/events';

interface ImpressionOptions<TName extends AnalyticsEventName> {
	enabled?: boolean;
	event: TName;
	props: AnalyticsEventProps<TName>;
	threshold?: number;
}

function getPageType(pathname: string) {
	if (pathname === '/') {
		return 'home';
	}

	if (pathname.startsWith('/partners/')) {
		return pathname === '/partners/' || pathname === '/partners'
			? 'partners_index'
			: 'partner_detail';
	}

	if (pathname.startsWith('/blog/')) {
		return pathname === '/blog/' || pathname === '/blog' ? 'blog_index' : 'blog_post';
	}

	if (pathname.startsWith('/docs/') || pathname.includes('/docs/')) {
		return 'docs';
	}

	if (pathname.startsWith('/partners-embed')) {
		return 'partners_embed';
	}

	if (pathname === '/builder' || pathname === '/builder/' || pathname.startsWith('/builder/')) {
		return 'application_builder';
	}

	return 'page';
}

function normalizeAnalyticsValue(value: unknown): AnalyticsPropertyValue | undefined {
	if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
		return value;
	}

	if (value === null || value === undefined) {
		return undefined;
	}

	if (Array.isArray(value)) {
		const normalizedEntries = value
			.map((entry) => normalizeAnalyticsValue(entry))
			.filter((entry) => entry !== undefined);

		return normalizedEntries.join(',');
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

// Accepts any object — call sites pass typed event props which carry
// specific keys. We just iterate string-keyed values, so an exact shape
// isn't needed.
function buildEventPayload(props: object): EventPayload {
	const payload: EventPayload = {};

	if (typeof window !== 'undefined') {
		payload.page_location = window.location.href;
		payload.page_path = window.location.pathname;
		payload.page_title = document.title;
		payload.page_type = getPageType(window.location.pathname);
	}

	for (const [key, value] of Object.entries(props)) {
		const normalized = normalizeAnalyticsValue(value);

		if (normalized === undefined) {
			continue;
		}

		payload[key] = normalized;
	}

	return payload;
}

const analyticsProviders = [googleAnalyticsProvider];

/**
 * Track an analytics event. Type-safe — the event name determines which
 * properties are required. See `.agents/analytics.md` for what each event
 * means in the user flow.
 *
 * @example
 *   trackEvent('partner_clicked', {
 *     partner_id: 'vercel',
 *     placement: 'directory',
 *     destination: 'internal_detail',
 *   })
 */
export function trackEvent<TName extends AnalyticsEventName>(
	name: TName,
	props: AnalyticsEventProps<TName>,
): void {
	const payload = buildEventPayload(props);

	for (const provider of analyticsProviders) {
		try {
			provider.trackEvent(name, payload);
		} catch {
			// Analytics failures should never affect user flows.
		}
	}
}

/**
 * Track an SPA page view. Called from the root route on navigation.
 */
export function trackPageView(pagePath: string) {
	trackEvent('page_view', {
		page_location: window.location.href,
		page_path: pagePath,
		page_title: document.title,
	});
}

/**
 * Fire a typed event when an element scrolls into view. Fires once per
 * element-mount per session (the IntersectionObserver disconnects after
 * the first crossing of the threshold).
 *
 * Note on behavior: when the host element unmounts and remounts (e.g.
 * because of a parent's filter change), the impression re-fires. Dedup
 * in BigQuery if you need session-unique impression counts.
 */
export function useTrackedImpression<
	TName extends AnalyticsEventName,
	TElement extends Element = Element,
>({ enabled = true, event, props, threshold = 0.5 }: ImpressionOptions<TName>) {
	const ref = React.useRef<TElement | null>(null);
	const hasTrackedRef = React.useRef(false);
	const propsRef = React.useRef(props);

	React.useEffect(() => {
		propsRef.current = props;
	}, [props]);

	React.useEffect(() => {
		if (!enabled || hasTrackedRef.current) {
			return;
		}

		const element = ref.current;
		if (!element) {
			return;
		}

		const track = () => {
			if (hasTrackedRef.current) {
				return;
			}

			hasTrackedRef.current = true;
			trackEvent(event, propsRef.current);
		};

		if (typeof IntersectionObserver === 'undefined') {
			track();
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) {
						continue;
					}

					if (entry.intersectionRatio < threshold) {
						continue;
					}

					track();
					observer.disconnect();
					return;
				}
			},
			{ threshold: [threshold] },
		);

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, [enabled, event, threshold]);

	return ref;
}
