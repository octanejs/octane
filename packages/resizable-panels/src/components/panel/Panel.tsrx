import { useEffect, useRef, useSyncExternalStore } from 'octane';
import { subscribeToMountedGroup } from '../../global/mutable-state/groups';
import { useId } from '../../hooks/useId';
import { useIsomorphicLayoutEffect } from '../../hooks/useIsomorphicLayoutEffect';
import { useMergedRefs } from '../../hooks/useMergedRefs';
import { useStableCallback } from '../../hooks/useStableCallback';
import { useStableObject } from '../../hooks/useStableObject';
import { useGroupContext } from '../group/useGroupContext';
import type { PanelProps, PanelSize, RegisteredPanel } from './types';
import { usePanelImperativeHandle } from './usePanelImperativeHandle';

export function Panel(props: PanelProps) @{
	const {
		children,
		className,
		collapsedSize = '0%',
		collapsible = false,
		defaultSize,
		disabled,
		elementRef: elementRefProp,
		groupResizeBehavior = 'preserve-relative-size',
		id: idProp,
		maxSize = '100%',
		minSize = '0%',
		onResize: onResizeUnstable,
		panelRef,
		style,
		...rest
	} = props;
	const idIsStable = !!idProp;
	const id = useId(idProp);
	const stableProps = useStableObject({ disabled });
	const elementRef = useRef<HTMLDivElement | null>(null);
	const mergedRef = useMergedRefs(elementRef, elementRefProp);
	const { getPanelStyles, id: groupId, orientation, registerPanel, updatePanelProps } =
		useGroupContext();
	const hasOnResize = onResizeUnstable != null;
	const onResizeStable = useStableCallback((
		panelSize: PanelSize,
		_id: string | number | undefined,
		prevPanelSize: PanelSize | undefined,
	) => {
		onResizeUnstable?.(panelSize, idProp, prevPanelSize);
	});

	useIsomorphicLayoutEffect(() => {
		const element = elementRef.current;
		if (element === null) return;
		const registeredPanel: RegisteredPanel = {
			element,
			id,
			idIsStable,
			mutableValues: { expandToSize: undefined, prevSize: undefined },
			onResize: hasOnResize ? onResizeStable : undefined,
			panelConstraints: {
				groupResizeBehavior,
				collapsedSize,
				collapsible,
				defaultSize,
				disabled: stableProps.disabled,
				maxSize,
				minSize,
			},
		};
		return registerPanel(registeredPanel);
	}, [groupResizeBehavior, collapsedSize, collapsible, defaultSize, hasOnResize, id, idIsStable, maxSize, minSize, onResizeStable, registerPanel, stableProps]);

	useEffect(() => updatePanelProps(id, { disabled }), [disabled, id, updatePanelProps]);
	usePanelImperativeHandle(id, panelRef);

	const read = () => {
		const panelStyles = getPanelStyles(groupId, id);
		return panelStyles === undefined ? undefined : JSON.stringify(panelStyles);
	};
	const panelStylesString = useSyncExternalStore(
		(subscribe) => subscribeToMountedGroup(groupId, () => subscribe()),
		read,
		read,
	);
	const panelStyles =
		panelStylesString
			? JSON.parse(panelStylesString) as Record<string, unknown>
			: defaultSize !== undefined
				? { flexGrow: undefined, flexShrink: undefined, flexBasis: defaultSize }
				: { flexGrow: 1 };

	return <div
		{...rest}
		data-disabled={disabled || undefined}
		data-panel
		data-testid={id}
		id={id}
		ref={mergedRef}
		style={{
			...PROHIBITED_CSS_PROPERTIES,
			display: 'flex',
			flexBasis: 0,
			flexShrink: 1,
			overflow: 'visible',
			...panelStyles,
		}}
	>
		<div
			className={className}
			style={{
				maxHeight: '100%',
				maxWidth: '100%',
				flexGrow: 1,
				overflow: 'auto',
				...style,
				touchAction: orientation === 'horizontal' ? 'pan-y' : 'pan-x',
			}}
		>{children}</div>
	</div>;
}

(Panel as { displayName?: string }).displayName = 'Panel';

const PROHIBITED_CSS_PROPERTIES = {
	minHeight: 0,
	maxHeight: '100%',
	height: 'auto',
	minWidth: 0,
	maxWidth: '100%',
	width: 'auto',
	border: 'none',
	borderWidth: 0,
	padding: 0,
	margin: 0,
} as const;
