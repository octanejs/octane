/** @jsxImportSource octane */
import { Suspense, useEffect, useLayoutEffect, useRef, useState, type OctaneNode } from 'octane';
import {
	getBoneyardConfig,
	getRegisteredSkeleton,
	normalizeBone,
	selectBreakpoint,
} from './core.js';
import type { AnimationStyle, BoneSuspenseProps, SkeletonProps } from './types.js';

const STYLES = `
@keyframes octane-boneyard-pulse{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes octane-boneyard-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
`;

function nearestDark(element: HTMLElement | null): boolean {
	return element?.closest('.dark') != null || document.documentElement.classList.contains('dark');
}

function numericOption(value: number | boolean | undefined, enabledDefault: number): number {
	return value === true ? enabledDefault : typeof value === 'number' ? value : 0;
}

function animationName(value: AnimationStyle | boolean | undefined): AnimationStyle {
	if (value === false) return 'solid';
	if (value === true || value == null) return 'pulse';
	return value;
}

export function Skeleton(props: SkeletonProps): OctaneNode {
	const defaults = getBoneyardConfig();
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	const [dark, setDark] = useState(false);
	const data = props.initialBones ?? (props.name ? getRegisteredSkeleton(props.name) : undefined);
	const selected = data ? selectBreakpoint(data, width) : undefined;
	const mode = animationName(props.animate ?? defaults.animate);
	const color = dark
		? (props.darkColor ?? defaults.darkColor ?? '#222222')
		: (props.color ?? defaults.color ?? '#f0f0f0');
	const shimmer = dark
		? (props.darkShimmerColor ?? defaults.darkShimmerColor ?? '#2c2c2c')
		: (props.shimmerColor ?? defaults.shimmerColor ?? '#f7f7f7');
	const speed = props.speed ?? defaults.speed ?? (mode === 'shimmer' ? '2s' : '1.8s');
	const angle = props.shimmerAngle ?? defaults.shimmerAngle ?? 110;
	const stagger = numericOption(props.stagger ?? defaults.stagger, 80);
	const transition = numericOption(props.transition ?? defaults.transition, 300);
	const boneClass = props.boneClass ?? defaults.boneClass;

	useLayoutEffect(() => {
		const element = wrapperRef.current;
		if (!element) return;
		const update = () => {
			setWidth(element.getBoundingClientRect().width);
			setDark(nearestDark(element));
		};
		update();
		const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
		resize?.observe(element);
		const mutation =
			typeof MutationObserver === 'undefined'
				? undefined
				: new MutationObserver(() => setDark(nearestDark(element)));
		mutation?.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class'],
			subtree: true,
		});
		return () => {
			resize?.disconnect();
			mutation?.disconnect();
		};
	}, [props.loading]);

	useEffect(() => {
		if (typeof matchMedia !== 'function') return;
		const media = matchMedia('(prefers-color-scheme: dark)');
		const update = () => setDark(nearestDark(wrapperRef.current));
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	}, []);

	const bones = (selected?.bones ?? []).map((bone, index) => ({
		...normalizeBone(bone),
		key: `${index}`,
		index,
	}));
	if (!props.loading) return props.children ?? null;
	if (!selected) return props.fallback ?? null;
	return (
		<div
			ref={wrapperRef}
			class={props.className}
			data-boneyard={props.name ?? selected.name ?? 'component'}
			aria-busy="true"
			style={{
				position: 'relative',
				width: '100%',
				height: `${selected.height}px`,
				overflow: 'hidden',
				transition: transition > 0 ? `opacity ${transition}ms ease` : undefined,
			}}
		>
			<style>{STYLES}</style>
			{bones.map((bone) =>
				bone.container ? null : (
					<div
						key={bone.key}
						aria-hidden="true"
						class={boneClass}
						data-boneyard-bone=""
						style={{
							position: 'absolute',
							left: `${bone.x}%`,
							top: `${bone.y}px`,
							width: `${bone.width}%`,
							height: `${bone.height}px`,
							borderRadius: typeof bone.radius === 'number' ? `${bone.radius}px` : bone.radius,
							background:
								mode === 'shimmer'
									? `linear-gradient(${angle}deg, ${color} 30%, ${shimmer} 50%, ${color} 70%)`
									: color,
							backgroundSize: mode === 'shimmer' ? '200% 100%' : undefined,
							animation:
								mode === 'solid' ? 'none' : `octane-boneyard-${mode} ${speed} ease-in-out infinite`,
							animationDelay: stagger > 0 ? `${bone.index * stagger}ms` : undefined,
						}}
					/>
				),
			)}
		</div>
	);
}

export function BoneSuspense(props: BoneSuspenseProps): OctaneNode {
	const { children, ...skeletonProps } = props;
	return <Suspense fallback={<Skeleton {...skeletonProps} loading={true} />}>{children}</Suspense>;
}
