export function asComponentElement<Component extends (...args: never[]) => unknown>(
	value: unknown,
): ReturnType<Component> {
	return value as ReturnType<Component>;
}
