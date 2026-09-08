import { useCreatable } from '../src/creatable.tsrx';
import type { CreatableBaseProps } from '../src/use-creatable.tsrx';

export type CreatableOption = { label: string; value: string; __isNew__?: boolean };
export type CreatableResult = CreatableBaseProps<CreatableOption, false, never>;

export function CreatableFixture(props: {
	bind: (result: CreatableResult) => void;
	creatableProps: CreatableResult;
}) @{
	const result = useCreatable(props.creatableProps);
	props.bind(result);
	<output data-options={JSON.stringify(result.options)} />
}
