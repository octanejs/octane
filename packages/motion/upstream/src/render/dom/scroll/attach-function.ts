import { observeTimeline } from "motion-dom"
import { scrollInfo } from "./track"
import { OnScroll, OnScrollWithInfo, ScrollOptionsWithDefaults } from "./types"
import { getTimeline } from "./utils/get-timeline"
import { isElementTracking } from "./utils/is-element-tracking"

/**
 * If the onScroll function has two arguments, it's expecting
 * more specific information about the scroll from scrollInfo.
 */
function isOnScrollWithInfo(onScroll: OnScroll): onScroll is OnScrollWithInfo {
    return onScroll.length === 2
}

export function attachToFunction(
    onScroll: OnScroll,
    options: ScrollOptionsWithDefaults
) {
    if (isOnScrollWithInfo(onScroll) || isElementTracking(options)) {
        return scrollInfo((info) => {
            onScroll(info[options.axis!].progress, info)
        }, options)
    } else {
        return observeTimeline(onScroll, getTimeline(options))
    }
}
