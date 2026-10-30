import { type OctaneNode, useLayoutEffect } from 'octane';

import { IsNewArchitecture } from '../constants-platform.ts';
import { measureContainersInLayoutEffect } from '../core/measureContainersInLayoutEffect.ts';
import { getContainerLayoutEffectScope } from '../core/scheduleContainerLayout.ts';
import { useArr$, useStateContext } from '../state/state.ts';
import { typedMemo } from '../types.internal.ts';

// Keep committed-container measurement scheduling out of the visual container layer.
// As the parent of the slots, this layout effect runs after their layout effects have
// added every committed container id to the pending measurement scope.
export const ContainerLayoutCoordinator = typedMemo(function ContainerLayoutCoordinatorComponent({
	children,
}: {
	children: OctaneNode;
}) {
	const ctx = useStateContext();
	const [containerLayoutEpoch] = useArr$(['containerLayoutEpoch']);

	useLayoutEffect(() => {
		if (IsNewArchitecture) {
			const targetContainerIds = getContainerLayoutEffectScope(ctx);
			if (targetContainerIds !== undefined) {
				measureContainersInLayoutEffect(ctx, targetContainerIds);
			}
		}
	}, [ctx, containerLayoutEpoch]);

	return <>{children}</>;
});
