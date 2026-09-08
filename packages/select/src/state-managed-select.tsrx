import { Select, type SelectProps } from './select.tsrx';
import { useStateManager, type StateManagerProps } from './use-state-manager.tsrx';
import type { GroupBase } from './types';

export type Props<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> =
	StateManagerProps<Option, IsMulti, Group>;

export function StateManagedSelect<
	Option = unknown,
	IsMulti extends boolean = false,
	Group extends GroupBase<Option> = GroupBase<Option>,
>(props: Props<Option, IsMulti, Group>) @{
	const selectProps = useStateManager<Option, IsMulti, Group>(props);
	<Select {...selectProps as SelectProps<Option, IsMulti, Group>} />
}
