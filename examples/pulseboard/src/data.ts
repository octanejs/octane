export type DashboardView = 'overview' | 'acquisition' | 'revenue';
export type DateRange = '7d' | '30d';
export type LogLevel = 'info' | 'warning' | 'error';

export interface TrendPoint {
	id: string;
	label: string;
	visitors: number;
	conversions: number;
}

export interface CampaignRow {
	id: string;
	campaign: string;
	channel: string;
	sessions: number;
	conversionRate: number;
	revenue: number;
	status: 'Growing' | 'Stable' | 'Watch';
}

export interface ActivityEvent {
	id: string;
	index: number;
	time: string;
	level: LogLevel;
	service: string;
	message: string;
	detail: string;
}

export const VIEW_COPY: Record<
	DashboardView,
	{ title: string; eyebrow: string; description: string }
> = {
	overview: {
		title: 'Growth overview',
		eyebrow: 'Northstar workspace',
		description: 'A live read of product reach, activation, and reliable revenue signals.',
	},
	acquisition: {
		title: 'Acquisition health',
		eyebrow: 'Journey intelligence',
		description: 'Channel quality, campaign efficiency, and the path from visit to activation.',
	},
	revenue: {
		title: 'Revenue momentum',
		eyebrow: 'Commercial intelligence',
		description: 'Durable expansion signals with the noisy edges kept visible.',
	},
};

const MONTH_LABELS = [
	'Jun 16',
	'Jun 17',
	'Jun 18',
	'Jun 19',
	'Jun 20',
	'Jun 21',
	'Jun 22',
	'Jun 23',
	'Jun 24',
	'Jun 25',
	'Jun 26',
	'Jun 27',
	'Jun 28',
	'Jun 29',
	'Jun 30',
	'Jul 1',
	'Jul 2',
	'Jul 3',
	'Jul 4',
	'Jul 5',
	'Jul 6',
	'Jul 7',
	'Jul 8',
	'Jul 9',
	'Jul 10',
	'Jul 11',
	'Jul 12',
	'Jul 13',
	'Jul 14',
	'Jul 15',
] as const;

const VISITOR_SEED = [
	1840, 1912, 1886, 2024, 2168, 2110, 2248, 2364, 2290, 2456, 2512, 2478, 2596, 2680, 2742, 2674,
	2818, 2920, 2862, 3014, 3098, 3180, 3126, 3268, 3342, 3294, 3488, 3562, 3690, 3824,
] as const;

const CONVERSION_SEED = [
	112, 120, 116, 127, 142, 136, 151, 158, 149, 166, 174, 169, 181, 189, 196, 188, 205, 217, 210,
	226, 235, 242, 237, 251, 260, 254, 273, 281, 294, 309,
] as const;

const VIEW_MULTIPLIER: Record<DashboardView, number> = {
	overview: 1,
	acquisition: 0.82,
	revenue: 0.64,
};

export function trendFor(view: DashboardView, range: DateRange): TrendPoint[] {
	const start = range === '7d' ? 23 : 0;
	const multiplier = VIEW_MULTIPLIER[view];
	return MONTH_LABELS.slice(start).map((label, localIndex) => {
		const index = start + localIndex;
		return {
			id: `trend-${view}-${index + 1}`,
			label,
			visitors: Math.round(VISITOR_SEED[index] * multiplier),
			conversions: Math.round(CONVERSION_SEED[index] * (view === 'revenue' ? 1.18 : multiplier)),
		};
	});
}

export const CAMPAIGNS: CampaignRow[] = [
	{
		id: 'signal-search',
		campaign: 'Signal search',
		channel: 'Paid search',
		sessions: 18420,
		conversionRate: 8.7,
		revenue: 128400,
		status: 'Growing',
	},
	{
		id: 'makers-letter',
		campaign: 'Makers letter',
		channel: 'Email',
		sessions: 12680,
		conversionRate: 11.4,
		revenue: 117200,
		status: 'Growing',
	},
	{
		id: 'northstar-guide',
		campaign: 'Northstar guide',
		channel: 'Organic',
		sessions: 22410,
		conversionRate: 6.9,
		revenue: 103800,
		status: 'Stable',
	},
	{
		id: 'workflow-week',
		campaign: 'Workflow week',
		channel: 'Community',
		sessions: 8940,
		conversionRate: 10.1,
		revenue: 92600,
		status: 'Growing',
	},
	{
		id: 'partner-studio',
		campaign: 'Partner studio',
		channel: 'Referral',
		sessions: 10670,
		conversionRate: 7.6,
		revenue: 81400,
		status: 'Stable',
	},
	{
		id: 'retarget-sprint',
		campaign: 'Retarget sprint',
		channel: 'Display',
		sessions: 15320,
		conversionRate: 4.8,
		revenue: 70600,
		status: 'Watch',
	},
	{
		id: 'operator-series',
		campaign: 'Operator series',
		channel: 'Video',
		sessions: 7310,
		conversionRate: 8.3,
		revenue: 68400,
		status: 'Stable',
	},
	{
		id: 'teams-benchmark',
		campaign: 'Teams benchmark',
		channel: 'Organic',
		sessions: 11870,
		conversionRate: 5.9,
		revenue: 61700,
		status: 'Stable',
	},
	{
		id: 'launch-briefing',
		campaign: 'Launch briefing',
		channel: 'Email',
		sessions: 6540,
		conversionRate: 9.2,
		revenue: 58300,
		status: 'Growing',
	},
	{
		id: 'founder-sessions',
		campaign: 'Founder sessions',
		channel: 'Community',
		sessions: 4880,
		conversionRate: 9.8,
		revenue: 51200,
		status: 'Stable',
	},
	{
		id: 'mobile-intent',
		campaign: 'Mobile intent',
		channel: 'Paid search',
		sessions: 9920,
		conversionRate: 3.7,
		revenue: 44600,
		status: 'Watch',
	},
	{
		id: 'legacy-display',
		campaign: 'Legacy display',
		channel: 'Display',
		sessions: 13740,
		conversionRate: 2.9,
		revenue: 37100,
		status: 'Watch',
	},
];

const SERVICES = ['edge', 'checkout', 'identity', 'events', 'warehouse', 'billing'] as const;
const INFO_MESSAGES = [
	'Aggregation window committed',
	'Journey cohort refreshed',
	'Attribution checkpoint stored',
	'Experiment exposure reconciled',
	'Dashboard snapshot published',
] as const;
const WARNING_MESSAGES = [
	'Ingestion delay crossed 800 ms',
	'Late event window expanded',
	'Conversion sample needs review',
] as const;

export const ACTIVITY_EVENTS: ActivityEvent[] = Array.from({ length: 360 }, (_, index) => {
	const number = index + 1;
	const level: LogLevel =
		number === 241 || number % 47 === 0 ? 'error' : number % 13 === 0 ? 'warning' : 'info';
	const service = SERVICES[index % SERVICES.length];
	const minute = String(Math.floor(index / 6) % 60).padStart(2, '0');
	const second = String((index * 7) % 60).padStart(2, '0');
	const message =
		number === 241
			? 'Checkout conversion spike isolated'
			: level === 'error'
				? 'Delivery batch exhausted its retry budget'
				: level === 'warning'
					? WARNING_MESSAGES[index % WARNING_MESSAGES.length]
					: INFO_MESSAGES[index % INFO_MESSAGES.length];
	return {
		id: `evt-${String(number).padStart(3, '0')}`,
		index,
		time: `14:${minute}:${second}`,
		level,
		service,
		message,
		detail:
			number === 241
				? 'Mobile checkout rose 38% above its seeded baseline; the alert is retained for investigation.'
				: `Deterministic trace ${String(9000 + number)} · ${service} pipeline`,
	};
});

export function isDashboardView(value: string | undefined): value is DashboardView {
	return value === 'overview' || value === 'acquisition' || value === 'revenue';
}

export function formatInteger(value: number): string {
	return new Intl.NumberFormat('en-US').format(value);
}

export function formatCurrency(value: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0,
	}).format(value);
}
