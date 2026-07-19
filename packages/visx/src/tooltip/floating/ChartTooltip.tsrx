import type React from 'react';
import type { OctaneNode } from 'octane';
import ChartTooltipContent from './ChartTooltipContent.tsrx';
import FloatingTooltip from './FloatingTooltip.tsrx';
import type {
	ChartTooltipConfig,
	ChartTooltipContentProps,
	ChartTooltipItem,
} from './ChartTooltipContent.tsrx';
import type {
	FloatingTooltipOffset,
	FloatingTooltipPadding,
	FloatingTooltipPortalProps,
	FloatingTooltipPositionerProps,
	FloatingTooltipRootState,
	TooltipAnchor,
	TooltipPlacement,
	UseFloatingTooltipOptions,
} from './types';

export { ChartTooltipItem } from './ChartTooltipContent.tsrx';

export type ChartTooltipControlledProps<Datum = unknown> = {
	open: boolean;
	anchor: TooltipAnchor | null;
	items: ChartTooltipItem<Datum>[];
};

export type ChartTooltipProps<Datum = unknown> = ChartTooltipControlledProps<Datum> & {
		config?: ChartTooltipConfig<Datum>;
		label?: OctaneNode;
		placement?: TooltipPlacement;
		strategy?: 'absolute' | 'fixed';
		offset?: number | FloatingTooltipOffset;
		collisionPadding?: FloatingTooltipPadding;
		portal?: boolean;
		portalProps?: Omit<FloatingTooltipPortalProps, 'children'>;
		positionerProps?: Omit<FloatingTooltipPositionerProps, 'children'>;
		contentProps?: Omit<ChartTooltipContentProps<Datum>, 'items' | 'config' | 'label'>;
		floatingOptions?: Omit<UseFloatingTooltipOptions<ChartTooltipItem<Datum>[]>, | 'open'
		| 'defaultOpen'
		| 'data'
		| 'defaultData'
		| 'anchor'
		| 'defaultAnchor'>;
		renderContent?: (params: {
			items: ChartTooltipItem<Datum>[];
			config?: ChartTooltipConfig<Datum>;
			state: FloatingTooltipRootState<ChartTooltipItem<Datum>[]>;
		}) => OctaneNode;
	};

export default function ChartTooltip<Datum = unknown>({
	anchor,
	collisionPadding,
	config,
	contentProps,
	floatingOptions,
	items,
	label,
	offset = 8,
	open,
	placement = 'top',
	portal = true,
	portalProps,
	positionerProps,
	renderContent,
	strategy,
}: ChartTooltipProps<Datum>) {
	return <FloatingTooltip.Root
		{...floatingOptions}
		open={open}
		anchor={anchor}
		data={items}
		placement={placement}
		strategy={strategy}
		offset={offset}
		collisionPadding={collisionPadding}
	>
		{(state) => {
			const content =
				renderContent?.({ items, config, state }) ??
					<ChartTooltipContent label={label} items={items} config={config} {...contentProps} />;

			if (!content) return null;

			const body = <FloatingTooltip.Positioner {...positionerProps}>
				<FloatingTooltip.Content>{content}</FloatingTooltip.Content>
			</FloatingTooltip.Positioner>;

			return portal
				? <FloatingTooltip.Portal {...portalProps}>{body}</FloatingTooltip.Portal>
				: (body);
		}}
	</FloatingTooltip.Root>;
}
