import { createMotionComponent, MotionComponentOptions } from "../../../motion"
import { createDomVisualElement } from "../../dom/create-visual-element"
import { DOMMotionComponents } from "../../dom/types"
import { CreateVisualElement } from "../../types"
import { featureBundle } from "./feature-bundle"

export function createMotionComponentWithFeatures<
    Props,
    TagName extends keyof DOMMotionComponents | string = "div"
>(
    Component: TagName | string | React.ComponentType<Props>,
    options?: MotionComponentOptions
) {
    return createMotionComponent(
        Component,
        options,
        featureBundle,
        createDomVisualElement as CreateVisualElement<Props, TagName>
    )
}
