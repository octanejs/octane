/**
 * Typed event registry for GA4 analytics.
 *
 * Source of truth for every event the site emits. The discriminated union
 * means wrong/missing props for a given event name produce a TypeScript
 * error at the call site rather than silent bad data downstream.
 *
 * See `.agents/analytics.md` for the human-readable reference (event
 * meanings, funnel definition, custom dimensions, BigQuery setup).
 */

import type { PartnerPlacementOrderStrategy } from '../partner-placement';

// ---------- Enums ----------

export type PartnerPlacement =
	| 'directory'
	| 'detail'
	| 'docs_rail'
	| 'blog_rail'
	| 'grid'
	| 'home_grid'
	| 'library_grid'
	| 'embed_grid'
	| 'docs_strip'
	| 'ecosystem_game'
	| 'partners_index_cta'
	| 'library_callout';

export type PartnerClickDestination = 'external' | 'internal_detail';

export type PartnerTierValue = 'gold' | 'silver' | 'bronze';

export type PartnerFilterChange = 'libraries_changed' | 'status_changed' | 'cleared_all';

export type BuilderMode = 'lucky' | 'confident' | 'none';

export type BuilderAction =
	| 'copy_prompt'
	| 'deploy'
	| 'clone_repo'
	| 'open_codex'
	| 'open_claude'
	| 'open_cursor'
	| 'download'
	| 'open_advanced'
	| 'netlify_start'
	| 'provider_redirect_manual'
	| 'provider_redirect_auto'
	| 'open_repo';

export type BuilderSurface = 'result_panel' | 'deploy_dialog';

export type BuilderFailureStage = 'analysis' | 'generation' | 'login_blocked';

// ---------- Session context ----------

/**
 * Slow-changing context stamped on every builder event so any breakdown
 * works in GA4 without joining sessions in BigQuery.
 */
export interface BuilderSessionContext {
	mode_used: BuilderMode;
	idea_used: string;
}

// ---------- Event union ----------

export type AnalyticsEvent =
	| {
			name: 'page_view';
			props: {
				page_location: string;
				page_path: string;
				page_title: string;
			};
	  }
	| {
			name: 'partner_viewed';
			props: {
				partner_id: string;
				order_strategy?: PartnerPlacementOrderStrategy;
				placement: PartnerPlacement;
				partner_tier?: PartnerTierValue;
				rotation_seed?: string;
				slot_index?: number;
			};
	  }
	| {
			name: 'partner_clicked';
			props: {
				partner_id: string;
				placement: PartnerPlacement;
				destination: PartnerClickDestination;
				destination_host?: string;
				order_strategy?: PartnerPlacementOrderStrategy;
				partner_tier?: PartnerTierValue;
				rotation_seed?: string;
				slot_index?: number;
			};
	  }
	| {
			name: 'partner_filter_applied';
			props: {
				change: PartnerFilterChange;
				library_filters: string;
				status_filter: string | null;
				result_count: number;
			};
	  }
	| {
			name: 'partner_inquiry_started';
			props: {
				placement: PartnerPlacement;
			};
	  }
	| {
			name: 'builder_analyzed';
			props: BuilderSessionContext & {
				analysis_deployment?: string;
				inferred_library_count: number;
				inferred_partner_count: number;
				feature_count: number;
			};
	  }
	| {
			name: 'builder_generated';
			props: BuilderSessionContext & {
				final_deployment?: string;
				final_package_manager?: string;
				final_library_count: number;
				final_partner_count: number;
				final_addon_count: number;
				library_ids: string;
				partner_ids: string;
				addon_ids: string;
			};
	  }
	| {
			name: 'builder_failed';
			props: BuilderSessionContext & {
				stage: BuilderFailureStage;
				error_message?: string;
				retry_after?: number;
				anonymous_generations_remaining?: number;
			};
	  }
	| {
			name: 'builder_activated';
			props: BuilderSessionContext & {
				action: BuilderAction;
				surface: BuilderSurface;
				provider?: string;
				automatic: boolean;
			};
	  };

// ---------- Helper types ----------

export type AnalyticsEventName = AnalyticsEvent['name'];

export type AnalyticsEventProps<TName extends AnalyticsEventName> = Extract<
	AnalyticsEvent,
	{ name: TName }
>['props'];

/**
 * Default session context for new builder sessions. `mode_used = 'none'`
 * means the user hasn't picked Lucky or Confident yet; `idea_used = 'none'`
 * means they haven't selected a suggested idea.
 */
export const defaultBuilderSessionContext: BuilderSessionContext = {
	mode_used: 'none',
	idea_used: 'none',
};
