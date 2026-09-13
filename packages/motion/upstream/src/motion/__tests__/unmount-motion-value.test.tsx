/**
 * Regression coverage for issue #3315.
 *
 * `VisualElement.unmount()` used to synchronously stop animations on any
 * motion value it owned. That broke React 19's reorder reconciliation — the
 * dragged tile briefly unmounts and remounts, and the synchronous stop
 * killed the in-flight `dragSnapToOrigin` animation before remount could
 * resubscribe, leaving the drag transform stranded.
 *
 * These tests pin the new behaviour: the synchronous stop is gone, and the
 * deferred auto-stop in `MotionValue.on("change")` cleanup still runs.
 */

import { createRef } from "react"
import { frame, visualElementStore } from "motion-dom"
import { motion } from "../../render/components/motion"
import { render } from "../../jest.setup"
import { nextFrame } from "../../gestures/__tests__/utils"

describe("motion value lifecycle on unmount (#3315)", () => {
    test("does not synchronously stop animations on VE-owned motion values", async () => {
        const ref = createRef<HTMLDivElement>()

        const Component = () => (
            <motion.div
                ref={ref}
                animate={{ x: 100 }}
                transition={{ duration: 10, ease: "linear" }}
            />
        )

        const { unmount, rerender } = render(<Component />)
        rerender(<Component />)
        await nextFrame()

        const ve = visualElementStore.get(ref.current!)!
        const xValue = ve.getValue("x")!

        // Confirm the test setup is exercising a VE-owned motion value
        // (this is the only path that hit the old synchronous stop).
        expect(xValue.owner).toBe(ve)
        expect(xValue.isAnimating()).toBe(true)

        // Subscribe so the deferred auto-stop won't run when the VE
        // unmounts — this simulates the React 19 remount case where a new
        // VisualElement re-binds to the motion value before the next frame.
        const externalSubscriber = jest.fn()
        const stopListening = xValue.on("change", externalSubscriber)

        unmount()

        // Pre-#3315 this would be false: VE.unmount called value.stop()
        // synchronously and killed the animation. We need it true so a
        // remount that re-subscribes can pick the animation up.
        expect(xValue.isAnimating()).toBe(true)

        stopListening()
    })

    test("deferred auto-stop fires on next frame when nothing resubscribes", async () => {
        const ref = createRef<HTMLDivElement>()

        const Component = () => (
            <motion.div
                ref={ref}
                animate={{ x: 100 }}
                transition={{ duration: 10, ease: "linear" }}
            />
        )

        const { unmount, rerender } = render(<Component />)
        rerender(<Component />)
        await nextFrame()

        const ve = visualElementStore.get(ref.current!)!
        const xValue = ve.getValue("x")!
        expect(xValue.isAnimating()).toBe(true)

        unmount()

        // Synchronously, animation is still running...
        expect(xValue.isAnimating()).toBe(true)

        // ...but with no listener attached, the deferred auto-stop runs on
        // the next frame and the animation is cleaned up. This is the path
        // that prevents leaks for genuinely permanent unmounts.
        await nextFrame()
        expect(xValue.isAnimating()).toBe(false)
    })

    test("animation can survive an unmount-then-resubscribe within a single frame", async () => {
        const ref = createRef<HTMLDivElement>()

        const Component = () => (
            <motion.div
                ref={ref}
                animate={{ x: 100 }}
                transition={{ duration: 10, ease: "linear" }}
            />
        )

        const { unmount, rerender } = render(<Component />)
        rerender(<Component />)
        await nextFrame()

        const ve = visualElementStore.get(ref.current!)!
        const xValue = ve.getValue("x")!
        expect(xValue.isAnimating()).toBe(true)

        unmount()

        // Simulate a remount re-establishing a change listener before the
        // deferred auto-stop callback runs.
        const resubscribe = jest.fn()
        const stopListening = xValue.on("change", resubscribe)

        // Wait long enough for the deferred frame.read callback to fire.
        await nextFrame()

        // Because a listener is now present, the auto-stop must skip and
        // the animation should keep ticking.
        expect(xValue.isAnimating()).toBe(true)
        // The motion value should still be reporting changes after the
        // simulated remount.
        const valueAfterRemount = xValue.get()
        await new Promise<void>((resolve) => frame.postRender(() => resolve()))
        expect(xValue.get()).not.toBe(valueAfterRemount)

        stopListening()
    })
})
