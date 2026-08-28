import { Select, type SelectProps } from './select.tsrx';
import { useAsync, type AsyncProps } from './use-async.tsrx';
import {
	useCreatable,
	type CreatableAdditionalProps,
	type CreatableBaseProps,
} from './use-creatable.tsrx';
import { useStateManager } from './use-state-manager.tsrx';
import type { StateManagerProps } from './use-state-manager.tsrx';
import type { GroupBase } from './types';

export type AsyncCreatableProps<Option, IsMulti extends boolean, Group extends GroupBase<Option>> =
	AsyncProps<Option, IsMulti, Group> & CreatableAdditionalProps<Option, Group> & StateManagerProps<
		Option,
		IsMulti,
		Group
	>;

function AsyncCreatableSelect<
	Option = unknown,
	IsMulti extends boolean = false,
	Group extends GroupBase<Option> = GroupBase<Option>,
>(props: AsyncCreatableProps<Option, IsMulti, Group>) @{
	const asyncProps = useAsync<Option, IsMulti, Group>(props);
	const stateProps = useStateManager<Option, IsMulti, Group>(asyncProps);
	const creatableProps = useCreatable(stateProps as CreatableBaseProps<Option, IsMulti, Group>);
	<Select {...creatableProps as SelectProps<Option, IsMulti, Group>} />
}

export default AsyncCreatableSelect;
