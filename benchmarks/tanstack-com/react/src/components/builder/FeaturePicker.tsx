/**
 * Feature Picker (v2)
 *
 * Component for selecting features in the builder.
 * Shows Framework (locked) -> Styling (Tailwind toggle) -> Add-ons hierarchy.
 * Grouped by category with conflict/dependency handling.
 * Features partner badges, external links, and collapsible sections.
 * Partner features use the shared partner placement policy within categories.
 */

import { useState, useMemo } from 'react';
import { twMerge } from 'tailwind-merge';
import { Star, ExternalLink, ChevronDown, Sparkles, X } from 'lucide-react';
import { matchSorter } from 'match-sorter';
import {
	useBuilderStore,
	useFeatureState,
	useAvailableFeatures,
	useAvailableExamples,
	useSelectedExample,
	useIntegrationSearch,
} from './store';
import { partners, type Partner } from '~/utils/partners';
import { getPartnerPlacementContext, getPartnersForPlacement } from '~/utils/partner-placement';
import { Tooltip } from '~/ui/Tooltip';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/Collapsible';
import type { FeatureId, FeatureInfo } from '~/builder/api';

type FeatureCategory =
	| 'tanstack'
	| 'database'
	| 'orm'
	| 'auth'
	| 'deploy'
	| 'tooling'
	| 'monitoring'
	| 'api'
	| 'i18n'
	| 'cms'
	| 'ecommerce'
	| 'other';

const builderFeaturePlacementContext = getPartnerPlacementContext({
	orderStrategy: 'contextual-recommendation',
	surface: 'builder_feature_picker',
});

const partnersById = new Map(
	partners.filter((partner) => partner.status === 'active').map((partner) => [partner.id, partner]),
);

const CATEGORY_INFO: Record<
	FeatureCategory,
	{ label: string; description: string; color: string }
> = {
	tanstack: {
		label: 'TanStack',
		description: 'Official TanStack libraries',
		color: '#00D1B2', // TanStack cyan/teal
	},
	database: {
		label: 'Database',
		description: 'Database providers and real-time backends',
		color: '#3B82F6', // Blue
	},
	orm: {
		label: 'ORM',
		description: 'Object-relational mapping and query builders',
		color: '#6366F1', // Indigo
	},
	auth: {
		label: 'Authentication',
		description: 'User authentication and authorization',
		color: '#8B5CF6', // Purple
	},
	deploy: {
		label: 'Deployment',
		description: 'Hosting and deployment platforms',
		color: '#EC4899', // Pink
	},
	monitoring: {
		label: 'Monitoring',
		description: 'Observability, error tracking, and performance monitoring',
		color: '#F59E0B', // Amber
	},
	cms: {
		label: 'CMS',
		description: 'Content management systems',
		color: '#10B981', // Emerald
	},
	ecommerce: {
		label: 'Ecommerce',
		description: 'Storefronts, checkout, and product catalogs',
		color: '#5A31F4', // Shopify purple
	},
	tooling: {
		label: 'Tooling',
		description: 'Development tools, linting, and utilities',
		color: '#F472B6', // Pink-400
	},
	api: {
		label: 'API',
		description: 'Type-safe APIs and RPC frameworks',
		color: '#EF4444', // Red
	},
	i18n: {
		label: 'i18n',
		description: 'Internationalization and localization',
		color: '#14B8A6', // Teal
	},
	other: {
		label: 'Other',
		description: 'Additional tools and integrations',
		color: '#A78BFA', // Violet-400
	},
};

const CATEGORY_ORDER: Array<FeatureCategory> = [
	'tanstack',
	'deploy',
	'database',
	'orm',
	'auth',
	'monitoring',
	'api',
	'i18n',
	'cms',
	'ecommerce',
	'tooling',
	'other',
];

// Custom addon color used in store.ts addCustomAddon
const CUSTOM_ADDON_COLOR = '#8B5CF6';

function getFeaturePartner(feature: FeatureInfo) {
	if (!feature.partnerId) {
		return undefined;
	}

	return partnersById.get(feature.partnerId);
}

function getFeaturePartnerPlacementRank(
	feature: FeatureInfo,
	partnerRankById: Map<string, number>,
) {
	if (!feature.partnerId) {
		return undefined;
	}

	return partnerRankById.get(feature.partnerId);
}

function getPartnerPlacementRankById(features: Array<FeatureInfo>) {
	const featurePartners = Array<Partner>();
	const featurePartnerIds = new Set<string>();

	for (const feature of features) {
		const partner = getFeaturePartner(feature);

		if (!partner || featurePartnerIds.has(partner.id)) {
			continue;
		}

		featurePartnerIds.add(partner.id);
		featurePartners.push(partner);
	}

	return new Map(
		getPartnersForPlacement(featurePartners, builderFeaturePlacementContext).map(
			(partner, index) => [partner.id, index],
		),
	);
}

// Sort features: partners first by shared placement policy, then non-partners, custom addons last
function sortFeaturesByPartnerPlacement(features: Array<FeatureInfo>): Array<FeatureInfo> {
	const partnerRankById = getPartnerPlacementRankById(features);

	return features
		.map((feature, index) => ({ feature, index }))
		.sort((left, right) => {
			// Custom addons always last
			const leftIsCustom = left.feature.color === CUSTOM_ADDON_COLOR;
			const rightIsCustom = right.feature.color === CUSTOM_ADDON_COLOR;

			if (leftIsCustom && !rightIsCustom) return 1;
			if (!leftIsCustom && rightIsCustom) return -1;

			const leftPartnerRank = getFeaturePartnerPlacementRank(left.feature, partnerRankById);
			const rightPartnerRank = getFeaturePartnerPlacementRank(right.feature, partnerRankById);

			if (leftPartnerRank !== undefined && rightPartnerRank !== undefined) {
				const partnerComparison = leftPartnerRank - rightPartnerRank;

				if (partnerComparison !== 0) {
					return partnerComparison;
				}

				return left.index - right.index;
			}

			if (leftPartnerRank !== undefined) return -1;
			if (rightPartnerRank !== undefined) return 1;

			return left.index - right.index;
		})
		.map(({ feature }) => feature);
}

export function FeaturePicker() {
	const availableFeatures = useAvailableFeatures();
	const search = useIntegrationSearch();

	// Filter features by search
	const filteredFeatures = useMemo(() => {
		if (!search.trim()) return availableFeatures;
		return matchSorter(availableFeatures, search, {
			keys: ['name', 'description', 'category'],
		});
	}, [availableFeatures, search]);

	// Separate partner features for "Featured" section, sorted by placement policy
	const partnerFeatures = useMemo(
		() => sortFeaturesByPartnerPlacement(filteredFeatures.filter((f) => f.partnerId)),
		[filteredFeatures],
	);

	// Group features by category, with partners sorted first by placement policy
	const featuresByCategory = useMemo(() => {
		return CATEGORY_ORDER.reduce(
			(acc, category) => {
				const categoryFeatures = filteredFeatures.filter((f) => f.category === category);
				acc[category] = sortFeaturesByPartnerPlacement(categoryFeatures);
				return acc;
			},
			{} as Record<FeatureCategory, Array<FeatureInfo>>,
		);
	}, [filteredFeatures]);

	const isSearching = search.trim().length > 0;

	return (
		<div className="p-4 space-y-2">
			{/* Example Picker */}
			{!isSearching && <ExamplePicker />}

			{/* Featured section */}
			{partnerFeatures.length > 0 && !isSearching && (
				<FeatureSection
					title="Featured"
					description="Popular integrations from our partners"
					features={partnerFeatures}
					categoryColor="#F59E0B"
					defaultOpen
				/>
			)}

			{/* Category sections */}
			{CATEGORY_ORDER.map((category) => {
				const features = featuresByCategory[category];
				if (!features || features.length === 0) return null;

				const info = CATEGORY_INFO[category];
				return (
					<FeatureSection
						key={category}
						title={info.label}
						description={info.description}
						features={features}
						categoryColor={info.color}
						defaultOpen
						forceOpen={isSearching}
					/>
				);
			})}

			{/* No results */}
			{isSearching && filteredFeatures.length === 0 && (
				<div className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">
					No add-ons found for "{search}"
				</div>
			)}
		</div>
	);
}

interface FeatureSectionProps {
	title: string;
	description: string;
	features: Array<FeatureInfo>;
	categoryColor: string;
	defaultOpen?: boolean;
	forceOpen?: boolean;
}

function FeatureSection({
	title,
	description,
	features,
	categoryColor,
	defaultOpen = false,
	forceOpen = false,
}: FeatureSectionProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const effectiveOpen = forceOpen || isOpen;

	return (
		<Collapsible open={effectiveOpen} onOpenChange={setIsOpen}>
			<CollapsibleTrigger className="w-full flex items-center justify-between py-3">
				<div className="text-left">
					<h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
					<p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
				</div>
				<ChevronDown
					className={twMerge(
						'w-4 h-4 text-gray-400 transition-transform duration-200',
						effectiveOpen && 'rotate-180',
					)}
				/>
			</CollapsibleTrigger>

			<CollapsibleContent>
				<div className="mt-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2 gap-1 px-1 pb-2">
					{features.map((feature) => (
						<FeatureCard key={feature.id} feature={feature} categoryColor={categoryColor} />
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

interface FeatureCardProps {
	feature: FeatureInfo;
	categoryColor: string;
}

function FeatureCard({ feature, categoryColor }: FeatureCardProps) {
	const toggleFeature = useBuilderStore((s) => s.toggleFeature);
	const getFeatureInfo = useBuilderStore((s) => s.getFeatureInfo);
	const { selected, enabled, disabledReason, exclusiveConflict, requiredBy } = useFeatureState(
		feature.id,
	);

	const handleClick = () => {
		if (enabled && !requiredBy) {
			toggleFeature(feature.id);
		}
	};

	const handleLinkClick = (e: React.MouseEvent) => {
		e.stopPropagation();
	};

	const isPartner = Boolean(feature.partnerId);
	const isDisabled = !enabled || !!requiredBy;

	// Build tooltip content
	const tooltipContent = disabledReason
		? disabledReason
		: exclusiveConflict
			? `Replaces ${getFeatureInfo(exclusiveConflict)?.name ?? exclusiveConflict}`
			: null;

	// Use feature color for the dot and selected state
	const featureColor = feature.color ?? categoryColor;

	const cardContent = (
		<button
			onClick={handleClick}
			disabled={isDisabled}
			className={twMerge(
				'relative w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
				selected
					? 'border-current'
					: enabled
						? 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
						: 'bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-800 opacity-60 cursor-not-allowed',
			)}
			style={
				selected
					? {
							borderColor: featureColor,
							backgroundColor: `${featureColor}15`,
						}
					: undefined
			}
		>
			{/* Color dot */}
			<div
				className={twMerge('w-3 h-3 shrink-0 rounded-full', !enabled && 'opacity-50')}
				style={{ backgroundColor: featureColor }}
			/>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<h3
					className={twMerge(
						'font-medium text-sm',
						selected && 'text-gray-900 dark:text-gray-100',
						!selected && enabled && 'text-gray-900 dark:text-gray-100',
						!selected && !enabled && 'text-gray-500 dark:text-gray-500',
					)}
				>
					{feature.name}
				</h3>
				<p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 sm:line-clamp-2 md:line-clamp-1 xl:line-clamp-2">
					{feature.description}
				</p>
			</div>

			{/* Partner badge + External link stacked */}
			{(isPartner || feature.link) && (
				<div className="flex flex-col items-center gap-2 shrink-0">
					{isPartner && (
						<span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-500 dark:text-amber-400 leading-none">
							<Star className="w-2.5 h-2.5 fill-amber-500 dark:fill-amber-400" />
							Partner
						</span>
					)}
					{feature.link && (
						<a
							href={feature.link}
							target="_blank"
							rel="noopener noreferrer"
							onClick={handleLinkClick}
							className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
						>
							<ExternalLink className="w-3.5 h-3.5" />
						</a>
					)}
				</div>
			)}
		</button>
	);

	if (tooltipContent) {
		return (
			<Tooltip content={tooltipContent} side="top">
				<div>{cardContent}</div>
			</Tooltip>
		);
	}

	return cardContent;
}

// Feature options panel
interface FeatureOptionsProps {
	featureId: FeatureId;
}

export function FeatureOptions({ featureId }: FeatureOptionsProps) {
	const feature = useBuilderStore((s) => s.getFeatureInfo(featureId));
	const featureOptions = useBuilderStore((s) => s.featureOptions);
	const setFeatureOption = useBuilderStore((s) => s.setFeatureOption);

	if (!feature || !feature.options || feature.options.length === 0) {
		return null;
	}

	const currentOptions = featureOptions[featureId] || {};

	return (
		<div className="space-y-3">
			{feature.options.map((option) => (
				<div key={option.key}>
					<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
						{option.label}
					</label>
					{option.type === 'select' && option.choices && (
						<select
							value={String(currentOptions[option.key] ?? option.default)}
							onChange={(e) => setFeatureOption(featureId, option.key, e.target.value)}
							className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
						>
							{option.choices.map((choice) => (
								<option key={choice.value} value={choice.value}>
									{choice.label}
								</option>
							))}
						</select>
					)}
					{option.type === 'boolean' && (
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={Boolean(currentOptions[option.key] ?? option.default)}
								onChange={(e) => setFeatureOption(featureId, option.key, e.target.checked)}
								className="rounded border-gray-300 dark:border-gray-600 text-cyan-600 focus:ring-cyan-500"
							/>
							<span className="text-sm text-gray-600 dark:text-gray-400">Enable</span>
						</label>
					)}
					{option.type === 'string' && (
						<input
							type="text"
							value={String(currentOptions[option.key] ?? option.default ?? '')}
							onChange={(e) => setFeatureOption(featureId, option.key, e.target.value)}
							className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
						/>
					)}
					{option.description && (
						<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{option.description}</p>
					)}
				</div>
			))}
		</div>
	);
}

/**
 * Example Picker - Single-select section for full demo apps
 */
function ExamplePicker() {
	const examples = useAvailableExamples();
	const selectedExample = useSelectedExample();
	const selectExample = useBuilderStore((s) => s.selectExample);
	const [isOpen, setIsOpen] = useState(true);

	if (examples.length === 0) return null;

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<CollapsibleTrigger className="w-full flex items-center justify-between py-3">
				<div className="text-left">
					<h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Examples</h2>
					<p className="text-xs text-gray-500 dark:text-gray-400">Start with a complete demo app</p>
				</div>
				<ChevronDown
					className={twMerge(
						'w-4 h-4 text-gray-400 transition-transform duration-200',
						isOpen && 'rotate-180',
					)}
				/>
			</CollapsibleTrigger>

			<CollapsibleContent>
				<div className="mt-1 grid grid-cols-1 gap-1 px-1 pb-2">
					{examples.map((example) => {
						const isSelected = selectedExample === example.id;

						return (
							<button
								key={example.id}
								onClick={() => selectExample(isSelected ? null : (example.id as any))}
								className={twMerge(
									'relative w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
									isSelected
										? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 dark:border-purple-400'
										: 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800',
								)}
							>
								{/* Icon */}
								<div
									className={twMerge(
										'w-8 h-8 shrink-0 rounded-lg flex items-center justify-center',
										isSelected
											? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400'
											: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
									)}
								>
									<Sparkles className="w-4 h-4" />
								</div>

								{/* Content */}
								<div className="flex-1 min-w-0">
									<h3
										className={twMerge(
											'font-medium text-sm',
											isSelected
												? 'text-purple-700 dark:text-purple-300'
												: 'text-gray-900 dark:text-gray-100',
										)}
									>
										{example.name}
									</h3>
									<p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
										{example.description}
									</p>
								</div>

								{/* Deselect button when selected */}
								{isSelected && (
									<div className="shrink-0 p-1 text-purple-600 dark:text-purple-400">
										<X className="w-4 h-4" />
									</div>
								)}
							</button>
						);
					})}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
