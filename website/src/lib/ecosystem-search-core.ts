export interface LibraryBindingEntity {
	kind: 'library-binding';
	id: string;
	title: string;
	packageName: string;
	upstreamPackage: string;
	category: string;
	categoryId: string;
	description: string;
	searchTerms: readonly string[];
	tags: readonly string[];
	order: number;
}

export interface FrameworkIntegrationEntity {
	kind: 'framework-integration';
	id: string;
	title: string;
	packageName: string;
	model: string;
	description: string;
	searchTerms: readonly string[];
	guideAnchor: string;
	order: number;
}

export type EcosystemEntity = LibraryBindingEntity | FrameworkIntegrationEntity;
export type EcosystemMatchBand = 'strong' | 'weak';

export interface EcosystemSearchResult {
	entity: EcosystemEntity;
	matchBand: EcosystemMatchBand;
	score: number;
}

export interface EcosystemFilters {
	kind?: string;
	category?: string;
}

export interface EcosystemSearchOptions extends EcosystemFilters {
	limit?: number;
}

export function normalizeSearchText(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

function tokensFor(value: string): string[] {
	const normalized = normalizeSearchText(value);
	return normalized ? normalized.split(' ') : [];
}

function editDistance(left: string, right: string): number {
	if (left === right) return 0;
	if (!left.length) return right.length;
	if (!right.length) return left.length;

	let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
		const current = [leftIndex];
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
			current[rightIndex] = Math.min(
				current[rightIndex - 1] + 1,
				previous[rightIndex] + 1,
				previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
			);
		}
		previous = current;
	}
	return previous[right.length];
}

function fuzzyTokenMatch(queryToken: string, identityToken: string): boolean {
	if (queryToken.length < 4 || identityToken.length < 4) return false;
	const maximum = queryToken.length <= 7 ? 1 : 2;
	if (Math.abs(queryToken.length - identityToken.length) > maximum) return false;
	// Plural task terms belong to weak category discovery rather than receiving
	// the identity precedence reserved for genuine spelling mistakes.
	if (queryToken === identityToken + 's' || identityToken === queryToken + 's') return false;
	return editDistance(queryToken, identityToken) <= maximum;
}

function identityValues(entity: EcosystemEntity): string[] {
	return [
		entity.title,
		entity.packageName,
		...(entity.kind === 'library-binding' ? [entity.upstreamPackage] : []),
		...entity.searchTerms,
	];
}

function metadataValues(entity: EcosystemEntity): string[] {
	return entity.kind === 'library-binding'
		? [entity.category, entity.description, ...entity.tags]
		: [entity.model, entity.description];
}

function strongScore(entity: EcosystemEntity, query: string, queryTokens: readonly string[]) {
	const values = identityValues(entity);
	const phrases = values.map(normalizeSearchText).filter(Boolean);
	if (phrases.some((phrase) => phrase === query)) return 1_000;
	if (phrases.some((phrase) => phrase.startsWith(query + ' '))) return 900;

	const identityTokens = new Set(values.flatMap(tokensFor));
	let score = 0;
	for (const queryToken of queryTokens) {
		if (identityTokens.has(queryToken)) {
			score += 80;
			continue;
		}
		if (Array.from(identityTokens).some((token) => token.startsWith(queryToken))) {
			score += 60;
			continue;
		}
		if (Array.from(identityTokens).some((token) => fuzzyTokenMatch(queryToken, token))) {
			score += 40;
			continue;
		}
		return undefined;
	}
	return 500 + score;
}

function weakScore(entity: EcosystemEntity, query: string, queryTokens: readonly string[]) {
	const values = metadataValues(entity).map(normalizeSearchText);
	const metadataTokens = new Set(values.flatMap((value) => value.split(' ')));
	if (
		!queryTokens.every((queryToken) =>
			Array.from(metadataTokens).some(
				(metadataToken) => metadataToken === queryToken || metadataToken.startsWith(queryToken),
			),
		)
	) {
		return undefined;
	}
	let score = values.some((value) => value === query) ? 120 : 40;
	if (values.some((value) => value.includes(query))) score += 40;
	return score;
}

export function filterEcosystemEntities(
	entities: readonly EcosystemEntity[],
	filters: EcosystemFilters,
): EcosystemEntity[] {
	const kind =
		filters.kind === 'binding' || filters.kind === 'integration' ? filters.kind : undefined;
	const categoryIds = new Set(
		entities.flatMap((entity) => (entity.kind === 'library-binding' ? [entity.categoryId] : [])),
	);
	const category =
		filters.category && categoryIds.has(filters.category) ? filters.category : undefined;

	return entities.filter((entity) => {
		if (kind === 'binding' && entity.kind !== 'library-binding') return false;
		if (kind === 'integration' && entity.kind !== 'framework-integration') return false;
		if (category && (entity.kind !== 'library-binding' || entity.categoryId !== category)) {
			return false;
		}
		return true;
	});
}

export function searchEcosystem(
	entities: readonly EcosystemEntity[],
	query: string,
	options: EcosystemSearchOptions = {},
): EcosystemSearchResult[] {
	const normalized = normalizeSearchText(query);
	if (normalized.length < 2) return [];
	const queryTokens = normalized.split(' ');
	const filtered = filterEcosystemEntities(entities, options);
	const matches = [];

	for (const entity of filtered) {
		const strong = strongScore(entity, normalized, queryTokens);
		if (strong !== undefined) {
			matches.push({ entity, matchBand: 'strong' as const, score: strong });
			continue;
		}
		const weak = weakScore(entity, normalized, queryTokens);
		if (weak !== undefined) {
			matches.push({ entity, matchBand: 'weak' as const, score: weak });
		}
	}

	return matches
		.sort(
			(left, right) =>
				(left.matchBand === right.matchBand
					? right.score - left.score
					: left.matchBand === 'strong'
						? -1
						: 1) || left.entity.order - right.entity.order,
		)
		.slice(0, options.limit ?? matches.length);
}
