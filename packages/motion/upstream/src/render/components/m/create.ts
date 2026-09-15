import { createMotionComponent, MotionComponentOptions } from "../../../motion"
import { DOMMotionComponents } from "../../dom/types"

export function createMinimalMotionComponent<
    Props,
    TagName extends keyof DOMMotionComponents | string = "div"
>(
    Component: TagName | string | React.ComponentType<Props>,
    options?: MotionComponentOptions
) {
    return createMotionComponent(Component, options)
}
