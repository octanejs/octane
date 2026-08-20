import type { ComponentBody, ElementDescriptor, OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

import type { UseTooltipParams } from '../hooks/useTooltip.tsrx';
import useTooltip from '../hooks/useTooltip.tsrx';

export type WithTooltipProvidedProps<TooltipData> = UseTooltipParams<TooltipData>;
type WithTooltipContainerProps = Octane.HTMLAttributes<HTMLDivElement>;
type RenderTooltipContainer = (
	children: ElementDescriptor,
	containerProps?: WithTooltipContainerProps,
) => ElementDescriptor | OctaneNode;

export default function withTooltip<BaseComponentProps = {}, TooltipData = {}>(
	BaseComponent: ComponentBody<BaseComponentProps & WithTooltipProvidedProps<TooltipData>>,
	containerProps: WithTooltipContainerProps = {
		style: {
			position: 'relative',
			width: 'inherit',
			height: 'inherit',
		} as const,
	},
	renderContainer: RenderTooltipContainer = function defaultRenderContainer(children, props) {
		return <div {...props}>{children}</div>;
	},
): (props: BaseComponentProps) => OctaneNode {
	function WrappedComponent(props: BaseComponentProps): OctaneNode {
		const tooltipProps = useTooltip<TooltipData>();

		return renderContainer(<BaseComponent {...tooltipProps} {...props} />, containerProps);
	}

	return WrappedComponent;
}
