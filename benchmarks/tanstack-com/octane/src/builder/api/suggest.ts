import type { ProjectDefinition } from './compile';
import { getFramework, DEFAULT_MODE } from './config';
import { create, type AddOn } from './create-worker';

export interface SuggestRequest {
	description?: string;
	current?: Partial<ProjectDefinition>;
	intent?: 'full-stack' | 'api-only' | 'static' | 'database' | 'auth' | 'deploy';
}

export interface FeatureSuggestion {
	id: string;
	name: string;
	reason: string;
	confidence: 'high' | 'medium' | 'low';
	category: string;
}

export interface SuggestResponse {
	suggestions: Array<FeatureSuggestion>;
	reasoning: string;
	recommendedTemplate?: string;
}

const FEATURE_KEYWORDS: Record<string, Array<{ keyword: string; weight: number }>> = {
	'tanstack-query': [
		{ keyword: 'data fetching', weight: 1 },
		{ keyword: 'api', weight: 0.7 },
		{ keyword: 'server state', weight: 1 },
		{ keyword: 'cache', weight: 0.8 },
		{ keyword: 'react query', weight: 1 },
		{ keyword: 'tanstack query', weight: 1 },
	],
	form: [
		{ keyword: 'form', weight: 1 },
		{ keyword: 'validation', weight: 0.8 },
		{ keyword: 'input', weight: 0.5 },
	],
	drizzle: [
		{ keyword: 'database', weight: 0.9 },
		{ keyword: 'sql', weight: 0.8 },
		{ keyword: 'postgres', weight: 0.9 },
		{ keyword: 'orm', weight: 0.8 },
		{ keyword: 'drizzle', weight: 1 },
	],
	prisma: [
		{ keyword: 'prisma', weight: 1 },
		{ keyword: 'database', weight: 0.7 },
		{ keyword: 'orm', weight: 0.7 },
	],
	clerk: [
		{ keyword: 'auth', weight: 0.8 },
		{ keyword: 'authentication', weight: 0.9 },
		{ keyword: 'login', weight: 0.8 },
		{ keyword: 'clerk', weight: 1 },
	],
	'better-auth': [
		{ keyword: 'auth', weight: 0.7 },
		{ keyword: 'self-hosted', weight: 1 },
		{ keyword: 'better-auth', weight: 1 },
	],
	ai: [
		{ keyword: 'ai', weight: 1 },
		{ keyword: 'llm', weight: 0.9 },
		{ keyword: 'chatbot', weight: 0.9 },
		{ keyword: 'openai', weight: 0.8 },
	],
	shadcn: [
		{ keyword: 'ui', weight: 0.6 },
		{ keyword: 'components', weight: 0.6 },
		{ keyword: 'shadcn', weight: 1 },
	],
	sentry: [
		{ keyword: 'error tracking', weight: 1 },
		{ keyword: 'monitoring', weight: 0.8 },
		{ keyword: 'sentry', weight: 1 },
	],
};

const INTENT_FEATURES: Record<string, Array<string>> = {
	'full-stack': ['drizzle', 'shadcn'],
	'api-only': ['drizzle'],
	database: ['drizzle'],
	auth: ['clerk'],
	deploy: [],
};

function getCategoryFromType(type: string): string {
	switch (type) {
		case 'deployment':
			return 'deploy';
		case 'toolchain':
			return 'tooling';
		default:
			return 'other';
	}
}

export async function suggestHandler(request: SuggestRequest): Promise<SuggestResponse> {
	const framework = await getFramework();
	const allAddOns = create.getAllAddOns(framework, DEFAULT_MODE);
	const addOnMap = new Map(allAddOns.map((a: AddOn) => [a.id, a] as const));

	const suggestions: Array<FeatureSuggestion> = [];
	const reasons: Array<string> = [];

	const currentFeatures = new Set(request.current?.features || []);

	if (request.description) {
		const description = request.description.toLowerCase();

		for (const [featureId, keywords] of Object.entries(FEATURE_KEYWORDS)) {
			if (currentFeatures.has(featureId)) continue;

			let score = 0;
			const matchedKeywords: Array<string> = [];

			for (const { keyword, weight } of keywords) {
				if (description.includes(keyword.toLowerCase())) {
					score += weight;
					matchedKeywords.push(keyword);
				}
			}

			if (score > 0) {
				const addOn = addOnMap.get(featureId) as AddOn | undefined;
				if (addOn) {
					suggestions.push({
						id: featureId,
						name: addOn.name,
						reason: `Matches: ${matchedKeywords.join(', ')}`,
						confidence: score >= 1 ? 'high' : score >= 0.5 ? 'medium' : 'low',
						category: getCategoryFromType(addOn.type),
					});
				}
			}
		}

		if (suggestions.length > 0) {
			reasons.push(
				`Based on your description, I identified ${suggestions.length} relevant features.`,
			);
		}
	}

	if (request.intent && INTENT_FEATURES[request.intent]) {
		const intentFeatures = INTENT_FEATURES[request.intent];

		for (const featureId of intentFeatures) {
			if (currentFeatures.has(featureId)) continue;
			if (suggestions.some((s) => s.id === featureId)) continue;

			const addOn = addOnMap.get(featureId) as AddOn | undefined;
			if (addOn) {
				suggestions.push({
					id: featureId,
					name: addOn.name,
					reason: `Recommended for ${request.intent} projects`,
					confidence: 'high',
					category: getCategoryFromType(addOn.type),
				});
			}
		}

		reasons.push(`Added recommendations for ${request.intent} development.`);
	}

	const confidenceOrder = { high: 0, medium: 1, low: 2 };
	suggestions.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

	for (const suggestion of [...suggestions]) {
		const addOn = addOnMap.get(suggestion.id) as AddOn | undefined;
		if (addOn?.dependsOn) {
			for (const required of addOn.dependsOn) {
				if (!currentFeatures.has(required) && !suggestions.some((s) => s.id === required)) {
					const requiredAddOn = addOnMap.get(required) as AddOn | undefined;
					if (requiredAddOn) {
						suggestions.push({
							id: required,
							name: requiredAddOn.name,
							reason: `Required by ${suggestion.name}`,
							confidence: 'high',
							category: getCategoryFromType(requiredAddOn.type),
						});
					}
				}
			}
		}
	}

	return {
		suggestions: suggestions.slice(0, 10),
		reasoning: reasons.join(' '),
	};
}
