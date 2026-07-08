// Port of context/RegisterGraphicalItemId.tsx — mints a stable per-item id
// (user override wins) and provides it to descendants via context. `children`
// is a RENDER PROP receiving the resolved id.
import { createContext, useContext } from 'octane';
import { useUniqueId } from '../util/useUniqueId';

const GraphicalItemIdContext = createContext(undefined);

export function RegisterGraphicalItemId(props) {
	const { id, type, children } = props;
	const resolvedId = useUniqueId('recharts-' + type, id);
	return <GraphicalItemIdContext.Provider value={resolvedId}>{children(
		resolvedId,
	)}</GraphicalItemIdContext.Provider>;
}

export function useGraphicalItemId() {
	return useContext(GraphicalItemIdContext);
}
