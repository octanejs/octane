import { createContext, useContext, useEffect, type OctaneNode } from 'octane';
import { useStableCallback } from '../../src/useStableCallback';

const CallbackContext = createContext<() => void>(() => {});
function Child() @{
	const callback = useContext(CallbackContext);
	useEffect(() => callback(), [callback]);
	<span>Ready</span>
}
export function StableCallbackFixture({ onCall }: { onCall: () => void }) @{
	const callback = useStableCallback(onCall);
	<CallbackContext value={callback}>
		<Child />
	</CallbackContext>
}
