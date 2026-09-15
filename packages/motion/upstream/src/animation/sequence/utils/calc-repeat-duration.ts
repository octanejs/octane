export function calculateRepeatDuration(
    duration: number,
    repeat: number,
    repeatDelay: number
): number {
    return duration * (repeat + 1) + repeatDelay * repeat
}
