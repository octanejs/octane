import { calculateRepeatDuration } from "../calc-repeat-duration"

describe("calculateRepeatDuration", () => {
    test("It correctly calculates the duration", () => {
        expect(calculateRepeatDuration(1, 0, 0)).toEqual(1)
        expect(calculateRepeatDuration(1, 1, 0)).toEqual(2)
        expect(calculateRepeatDuration(1, 2, 0)).toEqual(3)
    })

    test("It includes repeatDelay between iterations", () => {
        expect(calculateRepeatDuration(1, 1, 0.5)).toEqual(2.5)
        expect(calculateRepeatDuration(2, 3, 1)).toEqual(11)
        expect(calculateRepeatDuration(1, 0, 0.5)).toEqual(1)
    })
})
