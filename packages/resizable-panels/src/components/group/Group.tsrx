import { useEffect, useMemo, useRef } from 'octane';
import { calculatePanelConstraints } from '../../global/dom/calculatePanelConstraints';
import { mountGroup } from '../../global/mountGroup';
import {
	getMountedGroupState,
	getRegisteredGroup,
	subscribeToMountedGroup,
	updateMountedGroup,
} from '../../global/mutable-state/groups';
import { getInteractionState } from '../../global/mutable-state/interactions';
import { layoutNumbersEqual } from '../../global/utils/layoutNumbersEqual';
import { layoutsEqual } from '../../global/utils/layoutsEqual';
import { useForceUpdate } from '../../hooks/useForceUpdate';
import { useId } from '../../hooks/useId';
import { useIsomorphicLayoutEffect } from '../../hooks/useIsomorphicLayoutEffect';
import { useMergedRefs } from '../../hooks/useMergedRefs';
import { useStableCallback } from '../../hooks/useStableCallback';
import { useStableObject } from '../../hooks/useStableObject';
import type { RegisteredPanel } from '../panel/types';
import type { RegisteredSeparator } from '../separator/types';
import { GroupContext, type GroupContextValue } from './GroupContext';
import { sortByElementOffset } from './sortByElementOffset';
import type { GroupProps, Layout, RegisteredGroup, ResizeTargetMinimumSize } from './types';
import { useGroupImperativeHandle } from './useGroupImperativeHandle';

export function Group(props: GroupProps) @{
	const {
		children,
		className,
		defaultLayout,
		disableCursor,
		disabled,
		elementRef: elementRefProp,
		groupRef,
		id: idProp,
		onLayoutChange: onLayoutChangeUnstable,
		onLayoutChanged: onLayoutChangedUnstable,
		orientation = 'horizontal',
		resizeTargetMinimumSize = { coarse: 20, fine: 10 },
		style,
		...rest
	} = props;
	const previousLayouts = useRef({ onLayoutChange: {} as Layout, onLayoutChanged: {} as Layout });
	const onLayoutChange = useStableCallback((layout: Layout) => {
		if (layoutsEqual(previousLayouts.current.onLayoutChange, layout)) return;
		previousLayouts.current.onLayoutChange = layout;
		onLayoutChangeUnstable?.(layout);
	});
	const onLayoutChanged = useStableCallback((layout: Layout, isUserInteraction: boolean) => {
		if (layoutsEqual(previousLayouts.current.onLayoutChanged, layout)) return;
		previousLayouts.current.onLayoutChanged = layout;
		onLayoutChangedUnstable?.(layout, { isUserInteraction });
	});

	const id = useId(idProp);
	const elementRef = useRef<HTMLDivElement | null>(null);
	const [panelOrSeparatorChangeSigil, forceUpdate] = useForceUpdate();
	const valuesRef = useRef<{
		lastExpandedPanelSizes: Record<string, number>;
		layouts: Record<string, Layout>;
		panels: RegisteredPanel[];
		resizeTargetMinimumSize: ResizeTargetMinimumSize;
		separators: RegisteredSeparator[];
	}>({
		lastExpandedPanelSizes: {},
		layouts: {},
		panels: [],
		resizeTargetMinimumSize,
		separators: [],
	});
	valuesRef.current.resizeTargetMinimumSize = resizeTargetMinimumSize;
	const mergedRef = useMergedRefs(elementRef, elementRefProp);
	useGroupImperativeHandle(id, groupRef);

	const getPanelStyles = useStableCallback((groupId: string, panelId: string) => {
		const interaction = getInteractionState();
		const group = getRegisteredGroup(groupId);
		const state = getMountedGroupState(groupId);
		if (state) {
			const dragActive =
				interaction.state === 'active' &&
					interaction.hitRegions.some((region) => region.group === group);
			return {
				flexGrow: state.layout[panelId] ?? 1,
				pointerEvents: dragActive ? 'none' as const : undefined,
			};
		}
		const initialSize = defaultLayout?.[panelId];
		return initialSize === undefined ? undefined : { flexGrow: initialSize };
	});
	const stableProps = useStableObject({ defaultLayout, disableCursor });
	const context = useMemo<GroupContextValue>(
		() => ({
			get disableCursor() {
				return !!stableProps.disableCursor;
			},
			getPanelStyles,
			id,
			orientation,
			registerPanel(panel) {
				valuesRef.current.panels = sortByElementOffset(orientation, [
					...valuesRef.current.panels,
					panel,
				]);
				forceUpdate();
				return () => {
					valuesRef.current.panels = valuesRef.current.panels.filter(
						(current) => current !== panel,
					);
					forceUpdate();
				};
			},
			registerSeparator(separator) {
				valuesRef.current.separators = sortByElementOffset(orientation, [
					...valuesRef.current.separators,
					separator,
				]);
				forceUpdate();
				return () => {
					valuesRef.current.separators = valuesRef.current.separators.filter(
						(current) => current !== separator,
					);
					forceUpdate();
				};
			},
			updatePanelProps(panelId, next) {
				const panel = valuesRef.current.panels.find((current) => current.id === panelId);
				if (panel) panel.panelConstraints.disabled = next.disabled;
				const group = getRegisteredGroup(id);
				const state = getMountedGroupState(id);
				if (group && state) updateMountedGroup(group, {
					...state,
					derivedPanelConstraints: calculatePanelConstraints(group),
				});
			},
			updateSeparatorProps(separatorId, next) {
				const separator = valuesRef.current.separators.find(
					(current) => current.id === separatorId,
				);
				if (separator) Object.assign(separator, next);
			},
		}),
		[forceUpdate, getPanelStyles, id, orientation, stableProps],
	);

	const registeredGroupRef = useRef<RegisteredGroup | null>(null);
	useIsomorphicLayoutEffect(() => {
		const element = elementRef.current;
		if (element === null) return;
		const values = valuesRef.current;
		let sortedDefaultLayout: Layout | undefined;
		if (
			stableProps.defaultLayout &&
				Object.keys(stableProps.defaultLayout).length === values.panels.length
		) {
			sortedDefaultLayout = {};
			for (const panel of values.panels) {
				const size = stableProps.defaultLayout[panel.id];
				if (size !== undefined) sortedDefaultLayout[panel.id] = size;
			}
		}
		const group: RegisteredGroup = {
			disabled: !!disabled,
			element,
			id,
			mutableState: {
				defaultLayout: sortedDefaultLayout,
				disableCursor: !!stableProps.disableCursor,
				expandedPanelSizes: values.lastExpandedPanelSizes,
				layouts: values.layouts,
			},
			orientation,
			panels: values.panels,
			resizeTargetMinimumSize: values.resizeTargetMinimumSize,
			separators: values.separators,
		};
		registeredGroupRef.current = group;
		const unmount = mountGroup(group);
		const initial = getMountedGroupState(id, true);
		if (!initial.defaultLayoutDeferred && initial.derivedPanelConstraints.length > 0) {
			onLayoutChange(initial.layout);
			onLayoutChanged(initial.layout, false);
		}
		const unsubscribe = subscribeToMountedGroup(id, (event) => {
			const { defaultLayoutDeferred, derivedPanelConstraints, layout } = event.next;
			if (defaultLayoutDeferred || derivedPanelConstraints.length === 0) return;
			const panelIdsKey = group.panels.map((panel) => panel.id).join(',');
			group.mutableState.layouts[panelIdsKey] = layout;
			for (const constraints of derivedPanelConstraints) {
				const previousLayout = event.prev?.layout;
				if (
					constraints.collapsible && previousLayout &&
						layoutNumbersEqual(constraints.collapsedSize, layout[constraints.panelId]) &&
						!layoutNumbersEqual(constraints.collapsedSize, previousLayout[constraints.panelId])
				) {
					group.mutableState.expandedPanelSizes[constraints.panelId] =
						previousLayout[constraints.panelId];
				}
			}
			onLayoutChange(layout);
			if (getInteractionState().state !== 'active') onLayoutChanged(
				layout,
				event.isUserInteraction,
			);
		});
		return () => {
			registeredGroupRef.current = null;
			unmount();
			unsubscribe();
		};
	}, [disabled, id, onLayoutChange, onLayoutChanged, orientation, panelOrSeparatorChangeSigil, stableProps]);

	// Match upstream: prop updates only refresh mutable state; they do not reapply
	// defaultLayout via setLayout (React leaves the live layout alone).
	useEffect(() => {
		const group = registeredGroupRef.current;
		if (!group) return;
		group.mutableState.defaultLayout = defaultLayout;
		group.mutableState.disableCursor = !!disableCursor;
	}, [defaultLayout, disableCursor]);

	return <GroupContext.Provider value={context}>
		<div
			{...rest}
			className={className}
			data-group
			data-testid={id}
			id={id}
			ref={mergedRef}
			style={{
				height: '100%',
				width: '100%',
				overflow: 'hidden',
				...style,
				display: 'flex',
				flexDirection: orientation === 'horizontal' ? 'row' : 'column',
				flexWrap: 'nowrap',
				touchAction: orientation === 'horizontal' ? 'pan-y' : 'pan-x',
			}}
		>{children}</div>
	</GroupContext.Provider>;
}

(Group as { displayName?: string }).displayName = 'Group';
