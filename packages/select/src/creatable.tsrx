export { useCreatable } from './use-creatable.tsrx';
export type { Accessors, CreatableAdditionalProps } from './use-creatable.tsrx';

import { Select, type SelectProps } from './select.tsrx';
import {
	useCreatable,
	type CreatableAdditionalProps,
	type CreatableBaseProps,
} from './use-creatable.tsrx';
import { useStateManager, type StateManagerProps } from './use-state-manager.tsrx';
import type { GroupBase } from './types';

export type CreatableProps<Option, IsMulti extends boolean, Group extends GroupBase<Option>> =
	StateManagerProps<Option, IsMulti, Group> & CreatableAdditionalProps<Option, Group>;

function CreatableSelect<
	Option = unknown,
	IsMulti extends boolean = false,
	Group extends GroupBase<Option> = GroupBase<Option>,
>(props: CreatableProps<Option, IsMulti, Group>) @{
	const stateProps = useStateManager<Option, IsMulti, Group>(props);
	const creatableProps = useCreatable(stateProps as CreatableBaseProps<Option, IsMulti, Group>);
	<Select {...creatableProps as SelectProps<Option, IsMulti, Group>} />
}

export default CreatableSelect;
