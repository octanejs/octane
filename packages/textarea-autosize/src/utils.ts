export const noop = () => {};

export const pick = <T extends object, K extends keyof T>(
	props: readonly K[],
	obj: T,
): Pick<T, K> =>
	props.reduce(
		(acc, prop) => {
			acc[prop] = obj[prop];
			return acc;
		},
		{} as Pick<T, K>,
	);
