import { getFramework, DEFAULT_MODE, DEFAULT_REQUIRED_ADDONS, type FrameworkId } from './config';
import { create, type AddOn } from './create-worker';
import type { AddOnOption } from '@tanstack/create/worker';
import { partners } from '~/utils/partners.tsrx';

// Set of active partner IDs for matching addons to partners
const activePartnerIds = new Set(partners.filter((p) => p.status === 'active').map((p) => p.id));

const isDev = process.env.NODE_ENV !== 'production';

function normalizeUrl(url: string | undefined) {
	if (!url) return url;
	if (isDev) {
		return url.replace(/^https?:\/\/tanstack\.com/, '');
	}
	return url;
}

export interface FeatureOption {
	key: string;
	type: 'select' | 'boolean' | 'string';
	label: string;
	description?: string;
	default: string | boolean | number | null;
	choices?: Array<{ value: string; label: string }>;
}

export interface FeatureInfo {
	id: string;
	name: string;
	description: string;
	category: string;
	requires: Array<string>;
	exclusive: Array<string>;
	hasOptions: boolean;
	options?: Array<FeatureOption>;
	link?: string;
	color?: string;
	partnerId?: string;
	requiresTailwind?: boolean;
}

export interface FeaturesResponse {
	features: Array<FeatureInfo>;
	examples: Array<FeatureInfo>;
	version: string;
}

function mapAddOnOptions(addOn: AddOn): Array<FeatureOption> | undefined {
	if (!addOn.options) return undefined;

	return Object.entries(addOn.options).map(([key, opt]) => {
		const option = opt as AddOnOption;
		return {
			key,
			type: option.type,
			label: option.label,
			description: option.description,
			default: option.default,
			choices: option.type === 'select' ? option.options : undefined,
		};
	});
}

function getCategoryFromType(type: string): string {
	switch (type) {
		case 'deployment':
			return 'deploy';
		case 'toolchain':
			return 'tooling';
		case 'example':
			return 'example';
		default:
			return 'other';
	}
}

const CATEGORY_OVERRIDES: Record<string, string> = {
	shopify: 'ecommerce',
};

function toFeatureInfo(addOn: AddOn): FeatureInfo {
	// Type assertion for new fields that may not be in the cta-engine types yet
	const addon = addOn as AddOn & {
		category?: string;
		exclusive?: Array<string>;
		color?: string;
	};

	return {
		id: addon.id,
		name: addon.name,
		description: addon.description,
		category: CATEGORY_OVERRIDES[addon.id] ?? addon.category ?? getCategoryFromType(addon.type),
		requires: addon.dependsOn ?? [],
		exclusive: addon.exclusive ?? [],
		hasOptions: !!addon.options,
		options: mapAddOnOptions(addon),
		link: normalizeUrl(addon.link),
		color: addon.color,
		partnerId: activePartnerIds.has(addon.id) ? addon.id : undefined,
		requiresTailwind: addon.tailwind === true ? undefined : !addon.tailwind,
	};
}

export async function getFeaturesHandler(
	frameworkId: FrameworkId = 'react',
): Promise<FeaturesResponse> {
	const framework = await getFramework(frameworkId);
	const allAddOns = create.getAllAddOns(framework, DEFAULT_MODE);

	const features = allAddOns
		.filter((addOn: AddOn) => {
			if (DEFAULT_REQUIRED_ADDONS.includes(addOn.id)) return false;
			return ['add-on', 'deployment', 'toolchain'].includes(addOn.type);
		})
		.map(toFeatureInfo);

	const examples = allAddOns.filter((addOn: AddOn) => addOn.type === 'example').map(toFeatureInfo);

	return {
		features,
		examples,
		version: '1.0.0',
	};
}
