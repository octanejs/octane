import type {
	AnyBone,
	Bone,
	BoneyardConfig,
	ResponsiveBones,
	SkeletonData,
	SkeletonResult,
	SnapshotConfig,
} from './types.js';

const registry = new Map<string, SkeletonData>();
let defaults: BoneyardConfig = {};

export function configureBoneyard(config: BoneyardConfig): void {
	defaults = { ...defaults, ...config };
}

export function getBoneyardConfig(): Readonly<BoneyardConfig> {
	return defaults;
}

export function registerSkeleton(name: string, bones: SkeletonData): void {
	registry.set(name, bones);
}

export function registerSkeletons(entries: Record<string, SkeletonData>): void {
	for (const [name, bones] of Object.entries(entries)) registry.set(name, bones);
}

export function registerBones(entries: Record<string, SkeletonData>): void {
	registerSkeletons(entries);
}

export function getRegisteredSkeleton(name: string): SkeletonData | undefined {
	return registry.get(name);
}

export function normalizeBone(value: AnyBone): Bone {
	if (Array.isArray(value)) {
		if (value.length < 5) throw new TypeError('A compact bone must contain at least five values');
		const [x, y, width, height, radius, container] = value;
		if (![x, y, width, height].every(Number.isFinite)) {
			throw new TypeError('Bone geometry must contain finite numbers');
		}
		return {
			x: x as number,
			y: y as number,
			width: width as number,
			height: height as number,
			radius: radius as number | string,
			container: container === true,
		};
	}
	return value as Bone;
}

function isResponsive(data: SkeletonData): data is ResponsiveBones {
	return 'breakpoints' in data;
}

export function selectBreakpoint(data: SkeletonData, width: number): SkeletonResult {
	if (!isResponsive(data)) return data;
	const candidates = Object.entries(data.breakpoints)
		.map(([breakpoint, result]) => ({ breakpoint: Number(breakpoint), result }))
		.filter(({ breakpoint }) => Number.isFinite(breakpoint))
		.sort((left, right) => left.breakpoint - right.breakpoint);
	if (candidates.length === 0) {
		throw new TypeError('Responsive bones must contain at least one numeric breakpoint');
	}
	let selected = candidates[0]!.result;
	for (const candidate of candidates) {
		if (candidate.breakpoint > width) break;
		selected = candidate.result;
	}
	return selected;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

export function renderBones(result: SkeletonResult, color = '#f0f0f0'): string {
	const bones = result.bones
		.map(normalizeBone)
		.filter((bone) => !bone.container)
		.map(
			(bone) =>
				`<div aria-hidden="true" style="position:absolute;left:${bone.x}%;top:${bone.y}px;width:${bone.width}%;height:${bone.height}px;border-radius:${typeof bone.radius === 'number' ? `${bone.radius}px` : escapeHtml(bone.radius)};background:${escapeHtml(color)}"></div>`,
		)
		.join('');
	return `<div aria-busy="true" style="position:relative;width:100%;height:${result.height}px">${bones}</div>`;
}

function shouldSkip(element: Element, config: SnapshotConfig): boolean {
	if (config.excludeTags?.some((tag) => element.tagName.toLowerCase() === tag.toLowerCase())) {
		return true;
	}
	return config.excludeSelectors?.some((selector) => element.matches(selector)) ?? false;
}

export function snapshotBones(element: Element, config: SnapshotConfig = {}): SkeletonResult {
	const root = element.getBoundingClientRect();
	const leafTags = new Set(
		(config.leafTags ?? ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr']).map((tag) =>
			tag.toLowerCase(),
		),
	);
	const bones: AnyBone[] = [];
	const visit = (candidate: Element): void => {
		if (shouldSkip(candidate, config)) return;
		const rect = candidate.getBoundingClientRect();
		const style = getComputedStyle(candidate);
		const visible =
			rect.width > 0 &&
			rect.height > 0 &&
			style.display !== 'none' &&
			style.visibility !== 'hidden';
		if (!visible) return;
		const children = [...candidate.children];
		const leaf = leafTags.has(candidate.tagName.toLowerCase()) || children.length === 0;
		if (leaf) {
			const rawRadius = config.captureRoundedBorders === false ? '0' : style.borderRadius;
			const radius = rawRadius.endsWith('%') ? rawRadius : Number.parseFloat(rawRadius) || 0;
			bones.push([
				root.width === 0 ? 0 : ((rect.left - root.left) / root.width) * 100,
				rect.top - root.top,
				root.width === 0 ? 0 : (rect.width / root.width) * 100,
				rect.height,
				radius,
			]);
			return;
		}
		for (const child of children) visit(child);
	};
	for (const child of element.children) visit(child);
	return {
		name: element.getAttribute('data-boneyard') ?? 'component',
		viewportWidth: typeof window === 'undefined' ? root.width : window.innerWidth,
		width: root.width,
		height: root.height,
		bones,
	};
}
