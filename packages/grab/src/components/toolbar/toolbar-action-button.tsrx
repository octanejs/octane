import { resolveProp, Show, useProp, type Component, type JSX } from '../../reactive.js';
import { Tooltip } from '../tooltip.tsrx';

interface ToolbarActionButtonProps {
	actionId: string;
	label: string;
	isActive?: boolean;
	isToggle?: boolean;
	class?: string;
	wrapperClass?: string;
	ref?: (element: HTMLButtonElement | null) => void;
	onClick?: (event: MouseEvent) => void;
	onContextMenu?: (event: MouseEvent) => void;
	onMouseEnter?: (event: MouseEvent) => void;
	onMouseLeave?: (event: MouseEvent) => void;
	icon: JSX.Element;
	tooltip?: string;
	tooltipVisible?: boolean;
	tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
}

export const ToolbarActionButton: Component<ToolbarActionButtonProps> = (props) => {
	const actionId = useProp(props.actionId);
	const label = useProp(props.label);
	const isActive = useProp(props.isActive);
	const isToggle = useProp(props.isToggle);
	const className = useProp(props.class);
	const wrapperClass = useProp(props.wrapperClass);
	const tooltipVisible = useProp(() => Boolean(resolveProp(props.tooltipVisible)));
	const tooltipPosition = useProp(() => resolveProp(props.tooltipPosition) ?? 'top');

	return <div class={wrapperClass}>
		<button
			ref={(element) => {
				resolveProp(props.ref)?.(element);
			}}
			data-react-grab-ignore-events
			data-react-grab-toolbar-toggle={isToggle ? '' : undefined}
			data-react-grab-toolbar-action={actionId}
			aria-label={label}
			aria-pressed={Boolean(isActive)}
			type="button"
			class={className}
			onClick={(event) => resolveProp(props.onClick)?.(event)}
			onContextMenu={(event) => resolveProp(props.onContextMenu)?.(event)}
			onMouseEnter={(event) => resolveProp(props.onMouseEnter)?.(event)}
			onMouseLeave={(event) => resolveProp(props.onMouseLeave)?.(event)}
		>{props.icon}</button>
		<Show when={props.tooltip}>
			{(tooltip: () => string) =>
				<Tooltip visible={tooltipVisible} position={tooltipPosition} textContent={tooltip()} />}
		</Show>
	</div>;
};
