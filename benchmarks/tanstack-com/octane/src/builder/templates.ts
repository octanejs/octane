/**
 * Template Presets
 *
 * Hardcoded preset configurations for common app types.
 * Users can select a template to pre-populate features, then modify freely.
 */

import type { LucideIcon } from '@octanejs/lucide';
import {
	Rocket,
	Bot,
	LayoutDashboard,
	FileText,
	Server,
	Radio,
	Globe,
	HardDrive,
	Plus,
	ShoppingBag,
} from '@octanejs/lucide';

export interface Template {
	id: string;
	name: string;
	description: string;
	icon: LucideIcon;
	color: string;
	features: Array<string>;
	/**
	 * When set, selecting this preset also selects the matching CLI example
	 * (passed as `--template <id>` to the @tanstack/cli) instead of toggling
	 * loose features. The example's `dependsOn` add-ons are auto-included.
	 */
	exampleId?: string;
}

export const TEMPLATES: Array<Template> = [
	{
		id: 'blank',
		name: 'Blank',
		description: 'Start from scratch',
		icon: Plus,
		color: '#6B7280', // gray
		features: ['cloudflare'],
	},
	{
		id: 'saas',
		name: 'SaaS Starter',
		description: 'Auth, database, monitoring',
		icon: Rocket,
		color: '#F97316', // orange
		features: ['cloudflare', 'better-auth', 'neon', 'drizzle', 'sentry', 'shadcn', 'form'],
	},
	{
		id: 'ai-chat',
		name: 'AI Chat',
		description: 'LLM-powered app',
		icon: Bot,
		color: '#8B5CF6', // violet
		features: ['cloudflare', 'ai', 'store', 'shadcn'],
	},
	{
		id: 'dashboard',
		name: 'Dashboard',
		description: 'Admin panels, data tables',
		icon: LayoutDashboard,
		color: '#3B82F6', // blue
		features: ['cloudflare', 'table', 'tanstack-query', 'shadcn', 'form'],
	},
	{
		id: 'blog',
		name: 'Blog / CMS',
		description: 'Content-driven site',
		icon: FileText,
		color: '#EC4899', // pink
		features: ['cloudflare', 'strapi', 'tanstack-query'],
	},
	{
		id: 'api-first',
		name: 'API-First',
		description: 'Type-safe backend APIs',
		icon: Server,
		color: '#10B981', // emerald
		features: ['cloudflare', 'tRPC', 'tanstack-query', 'drizzle'],
	},
	{
		id: 'realtime',
		name: 'Realtime',
		description: 'Live, collaborative features',
		icon: Radio,
		color: '#EF4444', // red
		features: ['cloudflare', 'convex', 'tanstack-query'],
	},
	{
		id: 'i18n',
		name: 'Multi-Language',
		description: 'Internationalized app',
		icon: Globe,
		color: '#06B6D4', // cyan
		features: ['cloudflare', 'paraglide', 'shadcn'],
	},
	{
		id: 'local-first',
		name: 'Local-First',
		description: 'Offline-capable, sync-enabled',
		icon: HardDrive,
		color: '#F59E0B', // amber
		features: ['cloudflare', 'db', 'tanstack-query', 'store'],
	},
	{
		id: 'storefront',
		name: 'Storefront',
		description: 'Sell products with Shopify',
		icon: ShoppingBag,
		color: '#5A31F4', // Shopify purple
		features: ['cloudflare'],
		exampleId: 'shopify-storefront',
	},
];
