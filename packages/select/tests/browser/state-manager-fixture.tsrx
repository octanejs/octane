import type { OctaneNode } from 'octane';

import { useStateManager, type StateManagerProps } from '../../src/use-state-manager.tsrx';

export type StateManagerResult = ReturnType<typeof useStateManager>;

export function StateManagerFixture(props: {
	bind: (result: StateManagerResult) => void;
	managerProps: StateManagerProps<Record<string, string>, false>;
}): OctaneNode @{
	const result = useStateManager<Record<string, string>, false>(props.managerProps);
	props.bind(result);
	<output
		data-input-value={result.inputValue}
		data-menu-is-open={String(result.menuIsOpen)}
		data-value={JSON.stringify(result.value)}
	/>
}
