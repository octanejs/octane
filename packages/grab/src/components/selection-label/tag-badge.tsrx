import { resolveProp, Show, useProp, type Component } from '../../reactive.js';
import type { TagBadgeProps } from '../../types.js';
import { cn } from '../../utils/cn.js';

export const TagBadge: Component<TagBadgeProps> = (props) => {
	const handleMouseEnter = () => {
		resolveProp(props.onHoverChange)?.(true);
	};

	const handleMouseLeave = () => {
		resolveProp(props.onHoverChange)?.(false);
	};

	const accessibleName = useProp(() => {
		const componentName = resolveProp(props.componentName);
		return componentName
			? `${componentName}.${resolveProp(props.tagName)}`
			: resolveProp(props.tagName);
	});
	const componentName = useProp(props.componentName);
	const tagName = useProp(props.tagName);
	const shrink = useProp(props.shrink);

	// Render as a function so the inner span DOM nodes are created fresh per
	// branch of the outer <Show>. Sharing a single JSX.Element across both
	// branches is unsafe in SolidJS: a DOM node can only have one parent, so
	// toggling isClickable can make the label vanish (see solidjs/solid#2216,
	// solidjs/solid#2357).
	const renderTagLabel = () => <span
		class="text-[var(--rg-text-primary)] text-[13px] leading-4 h-fit font-medium overflow-hidden text-ellipsis whitespace-nowrap min-w-0"
	>
		<Show when={componentName}>
			<span>{componentName}</span>
			<span class="text-[var(--rg-text-secondary)]">{`.${tagName}`}</span>
		</Show>
		<Show when={!componentName}>
			<span class="text-[var(--rg-text-primary)]">{tagName}</span>
		</Show>
	</span>;

	const handleClick = (event: MouseEvent) => {
		resolveProp(props.onClick)?.(event);
	};

	return <Show
		when={props.isClickable}
		fallback={<div
			class={cn(
				'contain-layout flex items-center gap-1 max-w-[280px] overflow-hidden',
				shrink && 'shrink-0',
			)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onClick={handleClick}
		>{renderTagLabel()}</div>}
	>
		<button
			type="button"
			aria-label={`Open source for ${accessibleName}`}
			class={cn(
				'contain-layout flex items-center gap-1 max-w-[280px] overflow-hidden cursor-pointer bg-transparent border-none p-0 m-0 text-left',
				shrink && 'shrink-0',
			)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onClick={handleClick}
		>{renderTagLabel()}</button>
	</Show>;
};
