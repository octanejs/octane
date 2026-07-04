// Ported from .base-ui/packages/react/src/utils/getStateAttributesProps.ts.
// Turns a component's `state` object into `data-*` attributes: `true` → `data-key=""`,
// any other truthy value → `data-key="<value>"`, falsy → omitted. A `customMapping`
// entry overrides the default for a given state key.
export type StateAttributesMapping<State> = {
	[Property in keyof State]?: (state: State[Property]) => Record<string, string> | null;
};

export function getStateAttributesProps<State extends Record<string, any>>(
	state: State,
	customMapping?: StateAttributesMapping<State>,
): Record<string, string> {
	const props: Record<string, string> = {};

	for (const key in state) {
		const value = state[key];

		if (customMapping?.hasOwnProperty(key)) {
			const customProps = customMapping[key]!(value);
			if (customProps != null) {
				Object.assign(props, customProps);
			}
			continue;
		}

		if (value === true) {
			props[`data-${key.toLowerCase()}`] = '';
		} else if (value) {
			props[`data-${key.toLowerCase()}`] = value.toString();
		}
	}

	return props;
}
