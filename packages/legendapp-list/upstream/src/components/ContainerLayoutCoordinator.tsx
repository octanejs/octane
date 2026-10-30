import * as React from "react";

import { IsNewArchitecture } from "@/constants-platform";
import { measureContainersInLayoutEffect } from "@/core/measureContainersInLayoutEffect";
import { getContainerLayoutEffectScope } from "@/core/scheduleContainerLayout";
import { useArr$, useStateContext } from "@/state/state";
import { typedMemo } from "@/types.internal";

// Keep committed-container measurement scheduling out of the visual container layer.
// As the parent of the slots, this layout effect runs after their layout effects have
// added every committed container id to the pending measurement scope.
export const ContainerLayoutCoordinator = typedMemo(function ContainerLayoutCoordinatorComponent({
    children,
}: {
    children: React.ReactNode;
}) {
    const ctx = useStateContext();
    const [containerLayoutEpoch] = useArr$(["containerLayoutEpoch"]);

    React.useLayoutEffect(() => {
        if (IsNewArchitecture) {
            const targetContainerIds = getContainerLayoutEffectScope(ctx);
            if (targetContainerIds !== undefined) {
                measureContainersInLayoutEffect(ctx, targetContainerIds);
            }
        }
    }, [ctx, containerLayoutEpoch]);

    return children;
});
