export type AnalyticsPropertyValue = boolean | number | string;
export type EventProperties = Record<string, unknown>;
export type EventPayload = Record<string, AnalyticsPropertyValue>;

export type AnalyticsProvider = {
	trackEvent: (event: string, properties: EventPayload) => void;
};
