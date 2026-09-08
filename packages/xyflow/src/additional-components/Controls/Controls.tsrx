import { memo } from 'octane';
import cc from 'classcat';
import { shallow } from '@octanejs/zustand/shallow';

import { useStore, useStoreApi } from '../../hooks/useStore';
import { useReactFlow } from '../../hooks/useReactFlow';
import { Panel } from '../../components/Panel/index.tsrx';
import { type ReactFlowState } from '../../types';

import { PlusIcon } from './Icons/Plus.tsrx';
import { MinusIcon } from './Icons/Minus.tsrx';
import { FitViewIcon } from './Icons/FitView.tsrx';
import { LockIcon } from './Icons/Lock.tsrx';
import { UnlockIcon } from './Icons/Unlock.tsrx';
import { ControlButton } from './ControlButton.tsrx';
import type { ControlProps } from './types';

const selector = (s: ReactFlowState) => ({
	isInteractive: s.nodesDraggable || s.nodesConnectable || s.elementsSelectable,
	minZoomReached: s.transform[2] <= s.minZoom,
	maxZoomReached: s.transform[2] >= s.maxZoom,
	ariaLabelConfig: s.ariaLabelConfig,
});

function ControlsComponent({
	style,
	showZoom = true,
	showFitView = true,
	showInteractive = true,
	fitViewOptions,
	onZoomIn,
	onZoomOut,
	onFitView,
	onInteractiveChange,
	className,
	children,
	position = 'bottom-left',
	orientation = 'vertical',
	'aria-label': ariaLabel,
}: ControlProps) {
	const store = useStoreApi();
	const { isInteractive, minZoomReached, maxZoomReached, ariaLabelConfig } = useStore(
		selector,
		shallow,
	);
	const { zoomIn, zoomOut, fitView } = useReactFlow();

	const onZoomInHandler = () => {
		zoomIn();
		onZoomIn?.();
	};

	const onZoomOutHandler = () => {
		zoomOut();
		onZoomOut?.();
	};

	const onFitViewHandler = () => {
		fitView(fitViewOptions);
		onFitView?.();
	};

	const onToggleInteractivity = () => {
		store.setState({
			nodesDraggable: !isInteractive,
			nodesConnectable: !isInteractive,
			elementsSelectable: !isInteractive,
		});

		onInteractiveChange?.(!isInteractive);
	};

	const orientationClass =
		orientation === 'horizontal' ? 'horizontal' : 'vertical';
	return <Panel
		className={cc(['react-flow__controls', orientationClass, className])}
		position={position}
		style={style}
		data-testid="rf__controls"
		aria-label={ariaLabel ?? ariaLabelConfig['controls.ariaLabel']}
	>
		{showZoom &&
			<>
				<ControlButton
					onClick={onZoomInHandler}
					className="react-flow__controls-zoomin"
					title={ariaLabelConfig['controls.zoomIn.ariaLabel']}
					aria-label={ariaLabelConfig['controls.zoomIn.ariaLabel']}
					disabled={maxZoomReached}
				>
					<PlusIcon />
				</ControlButton>
				<ControlButton
					onClick={onZoomOutHandler}
					className="react-flow__controls-zoomout"
					title={ariaLabelConfig['controls.zoomOut.ariaLabel']}
					aria-label={ariaLabelConfig['controls.zoomOut.ariaLabel']}
					disabled={minZoomReached}
				>
					<MinusIcon />
				</ControlButton>
			</>}
		{showFitView &&
			<ControlButton
				className="react-flow__controls-fitview"
				onClick={onFitViewHandler}
				title={ariaLabelConfig['controls.fitView.ariaLabel']}
				aria-label={ariaLabelConfig['controls.fitView.ariaLabel']}
			>
				<FitViewIcon />
			</ControlButton>}
		{showInteractive &&
			<ControlButton
				className="react-flow__controls-interactive"
				onClick={onToggleInteractivity}
				title={ariaLabelConfig['controls.interactive.ariaLabel']}
				aria-label={ariaLabelConfig['controls.interactive.ariaLabel']}
			>
				{isInteractive ? <UnlockIcon /> : <LockIcon />}
			</ControlButton>}
		{children}
	</Panel>;
}

ControlsComponent.displayName = 'Controls';

/**
 * The `<Controls />` component renders a small panel that contains convenient
 * buttons to zoom in, zoom out, fit the view, and lock the viewport.
 *
 * @public
 * @example
 *```tsx
 *import { ReactFlow, Controls } from '@xyflow/react'
 *
 *export default function Flow() {
 *  return (
 *    <ReactFlow nodes={[...]} edges={[...]}>
 *      <Controls />
 *    </ReactFlow>
 *  )
 *}
 *```
 *
 * @remarks To extend or customise the controls, you can use the [`<ControlButton />`](/api-reference/components/control-button) component
 *
 */
export const Controls = memo(ControlsComponent);
