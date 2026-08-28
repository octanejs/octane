export { useAsync } from './use-async.tsrx';
export type { AsyncAdditionalProps, AsyncProps } from './use-async.tsrx';

import { Select, type SelectProps } from './select.tsrx';
import { useAsync, type AsyncProps } from './use-async.tsrx';
import { useStateManager } from './use-state-manager.tsrx';
import type { GroupBase } from './types';

function AsyncSelect<
	Option = unknown,
	IsMulti extends boolean = false,
	Group extends GroupBase<Option> = GroupBase<Option>,
>(props: AsyncProps<Option, IsMulti, Group> & SelectProps<Option, IsMulti, Group>) @{
	const asyncProps = useAsync<Option, IsMulti, Group>(props);
	const selectProps = useStateManager<Option, IsMulti, Group>(asyncProps);
	<Select {...selectProps as SelectProps<Option, IsMulti, Group>} />
}

export default AsyncSelect;
