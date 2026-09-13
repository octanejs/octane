/** @jsxImportSource octane */
import type { TagBadgeProps } from '../../types.js';
import { cn } from '../../utils/cn.js';

export const TagBadge = (props: TagBadgeProps) => {
	const handleMouseEnter = () => {
		props.onHoverChange?.(true);
	};

	const handleMouseLeave = () => {
		props.onHoverChange?.(false);
	};

	const accessibleName = () =>
		props.componentName ? `${props.componentName}.${props.tagName}` : props.tagName;

	// Render as a function so the inner span descriptors are created fresh per
	// branch of the outer ternary, matching the original single-parent contract.
	const renderTagLabel = () => (
		<span class="text-[var(--rg-text-primary)] text-[13px] leading-4 h-fit font-medium overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
			{props.componentName ? (
				<>
					<span>{props.componentName as string}</span>
					<span class="text-[var(--rg-text-secondary)]">{`.${props.tagName}` as string}</span>
				</>
			) : (
				<span class="text-[var(--rg-text-primary)]">{props.tagName as string}</span>
			)}
		</span>
	);

	return props.isClickable ? (
		<button
			type="button"
			aria-label={`Open source for ${accessibleName()}`}
			class={cn(
				'contain-layout flex items-center gap-1 max-w-[280px] overflow-hidden cursor-pointer bg-transparent border-none p-0 m-0 text-left',
				props.shrink && 'shrink-0',
			)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onClick={props.onClick}
		>
			{renderTagLabel()}
		</button>
	) : (
		<div
			class={cn(
				'contain-layout flex items-center gap-1 max-w-[280px] overflow-hidden',
				props.shrink && 'shrink-0',
			)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onClick={props.onClick}
		>
			{renderTagLabel()}
		</div>
	);
};
