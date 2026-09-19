import { createContext, use } from 'octane';

const Ctx = createContext('default');

function Leaf() {
	return <span className="leaf">{use(Ctx) as string}</span>;
}

// .tsx <Ctx> with a SINGLE component child (descriptor children + a
// component that returns a createElement descriptor — the de-opt return path).
export function App() {
	return (
		<Ctx value="provided">
			<Leaf />
		</Ctx>
	);
}
