export function Button() {
	return <button>Button</button>;
}
export namespace Button {
	export type Props = { label: string };
	export interface State {
		disabled: boolean;
	}
	export namespace Nested {
		export type Value = string;
	}
}
export const answer = 42;
