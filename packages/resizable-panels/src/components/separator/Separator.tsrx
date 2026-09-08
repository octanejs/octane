import { useEffect, useRef, useState } from 'octane';
import { subscribeToMountedGroup } from '../../global/mutable-state/groups';
import { subscribeToInteractionState } from '../../global/mutable-state/interactions';
import type { InteractionState } from '../../global/mutable-state/types';
import { calculateSeparatorAriaValues } from '../../global/utils/calculateSeparatorAriaValues';
import { useId } from '../../hooks/useId';
import { useIsomorphicLayoutEffect } from '../../hooks/useIsomorphicLayoutEffect';
import { useMergedRefs } from '../../hooks/useMergedRefs';
import { useStableObject } from '../../hooks/useStableObject';
import { useGroupContext } from '../group/useGroupContext';
import type { RegisteredSeparator, SeparatorProps } from './types';

type SeparatorAria = {
	valueControls?: string;
	valueMin?: number;
	valueMax?: number;
	valueNow?: number;
};

export function Separator(props: SeparatorProps) @{
	const {
		children,
		className,
		disabled,
		disableDoubleClick,
		elementRef: elementRefProp,
		id: idProp,
		style,
		...rest
	} = props;
	const id = useId(idProp);
	const stableProps = useStableObject({ disabled, disableDoubleClick });
	const [aria, setAria] = useState<SeparatorAria>({});
	const [dragState, setDragState] = useState<InteractionState['state']>('inactive');
	const [isFocused, setIsFocused] = useState(false);
	const elementRef = useRef<HTMLDivElement | null>(null);
	const mergedRef = useMergedRefs(elementRef, elementRefProp);
	const {
		disableCursor,
		id: groupId,
		orientation: groupOrientation,
		registerSeparator,
		updateSeparatorProps,
	} = useGroupContext();
	const orientation =
		groupOrientation === 'horizontal' ? 'vertical' : 'horizontal';

	useIsomorphicLayoutEffect(() => {
		const element = elementRef.current;
		if (element === null) return;
		const separator: RegisteredSeparator = {
			disabled: stableProps.disabled,
			disableDoubleClick: stableProps.disableDoubleClick,
			element,
			id,
		};
		const unregisterSeparator = registerSeparator(separator);
		const removeInteractionListener = subscribeToInteractionState((event) => {
			setDragState(
				event.next.state !== 'inactive' &&
				event.next.hitRegions.some((region) => region.separator === separator)
					? event.next.state
					: 'inactive',
			);
		});
		const removeGroupListener = subscribeToMountedGroup(groupId, (event) => {
			const { derivedPanelConstraints, layout, separatorToPanels } = event.next;
			const panels = separatorToPanels.get(separator);
			if (!panels) return;
			const primaryPanel = panels[0];
			if (!primaryPanel) return;
			setAria(
				calculateSeparatorAriaValues({
					layout,
					panelConstraints: derivedPanelConstraints,
					panelId: primaryPanel.id,
					panelIndex: panels.indexOf(primaryPanel),
				}),
			);
		});
		return () => {
			removeInteractionListener();
			removeGroupListener();
			unregisterSeparator();
		};
	}, [groupId, id, registerSeparator, stableProps]);

	useEffect(() => updateSeparatorProps(id, { disabled, disableDoubleClick }), [
		disabled,
		disableDoubleClick,
		id,
		updateSeparatorProps,
	]);
	const cursor =
		disabled && !disableCursor ? 'not-allowed' : undefined;
	const dataSeparator =
		disabled
			? 'disabled'
			: dragState === 'active'
				? 'active'
				: isFocused
					? 'focus'
					: dragState;

	return <div
		{...rest}
		aria-controls={aria.valueControls}
		aria-disabled={disabled || undefined}
		aria-orientation={orientation}
		aria-valuemax={aria.valueMax}
		aria-valuemin={aria.valueMin}
		aria-valuenow={aria.valueNow}
		className={className}
		data-separator={dataSeparator}
		data-testid={id}
		id={id}
		onBlur={() => setIsFocused(false)}
		onFocus={() => setIsFocused(true)}
		ref={mergedRef}
		role="separator"
		style={{ flexBasis: 'auto', cursor, ...style, flexGrow: 0, flexShrink: 0, touchAction: 'none' }}
		tabIndex={disabled ? undefined : 0}
	>{children}</div>;
}

(Separator as { displayName?: string }).displayName = 'Separator';
