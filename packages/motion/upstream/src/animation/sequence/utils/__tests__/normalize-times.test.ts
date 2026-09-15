import { normalizeTimes } from "../normalize-times"

describe("normalizeTimes", () => {
    test("It correctly scales times", () => {
        const times = [0, 0.5, 1, 1, 1.5, 2]
        const repeat = 1
        normalizeTimes(times, repeat)
        expect(times).toEqual([0, 0.25, 0.5, 0.5, 0.75, 1])
    })

    test("It accounts for repeatDelay between iterations", () => {
        const times = [0, 1, 1.5, 1.5, 2.5]
        normalizeTimes(times, 1, 0.5)
        expect(times).toEqual([0, 0.4, 0.6, 0.6, 1])
    })
})
