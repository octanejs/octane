import { useContextBridge } from '@octanejs/drei';
import { createContext, useContext } from 'octane';

const First = createContext('first-default');
const Second = createContext('second-default');

function Reader(props) @{
	props.onValue([useContext(First), useContext(Second)]);
}

function Capture(props) @{
	const Bridge = useContextBridge(First, Second);
	<First.Provider value="wrong-first">
		<Second.Provider value="wrong-second">
			<Bridge><Reader onValue={props.onValue} /></Bridge>
		</Second.Provider>
	</First.Provider>
}

export function ContextBridgeScene(props) @{
	<First.Provider value={props.first}>
		<Second.Provider value={props.second}>
			<Capture onValue={props.onValue} />
		</Second.Provider>
	</First.Provider>
}
