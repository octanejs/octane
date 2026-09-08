import {
	Fragment,
	Suspense,
	createContext,
	createPortal,
	use,
	useState,
	useReducer,
	useTransition,
} from 'octane';

interface HistoryProps {
	value: string;
	resource?: Promise<void> | null;
	reducer?: boolean;
	gateInChild?: boolean;
}

function HistoryGate({ resource }: { resource?: Promise<void> | null }) {
	if (resource) use(resource);
	return null;
}

function DerivedHistory({ value, resource, reducer, gateInChild }: HistoryProps) {
	const [state, setState] = useState({ current: value, previous: 'initial' });
	const [reduced, dispatch] = useReducer(
		(previous, current: string) => ({ current, previous: previous.current }),
		{ current: value, previous: 'initial' },
	);
	const history = reducer ? reduced : state;
	if (history.current !== value) {
		if (reducer) dispatch(value);
		else setState({ current: value, previous: history.current });
	}
	if (!gateInChild && resource) use(resource);
	return <Fragment>
		<output id="derived-history">{history.previous as string}</output>
		{gateInChild && <HistoryGate resource={resource} />}
	</Fragment>;
}

export function SuspendedDerivedHistory(props: HistoryProps) {
	return <Suspense fallback={<p id="loading">Loading</p>}>
		<DerivedHistory {...props} />
	</Suspense>;
}

function SuspendedReplacement({
	promise,
	attempted,
}: {
	promise: Promise<void>;
	attempted: () => void;
}) {
	attempted();
	throw promise;
}

const Context = createContext(null);
function Wrapper({ children }) {
	return <Context.Provider value={null}>{children}</Context.Provider>;
}

function CurrentPortal({ target }: { target: Element }) {
	return createPortal(<p id="current-portal">Current dialog</p>, target);
}

export function FragmentSuspenseTransition(props: {
	target: Element;
	promise: Promise<void>;
	attempted: () => void;
}) {
	const [replacement, setReplacement] = useState(false);
	const [, startTransition] = useTransition();
	return <Fragment>
		<button id="start" onClick={() => startTransition(() => setReplacement(true))}>Start</button>
		<button id="cancel" onClick={() => setReplacement(false)}>Cancel</button>
		<CurrentPortal target={props.target} />
		<Suspense fallback={<p id="loading">Loading</p>}>
			{replacement &&
				<Wrapper>
					<SuspendedReplacement promise={props.promise} attempted={props.attempted} />
					<CurrentPortal target={props.target} />
				</Wrapper>}
		</Suspense>
	</Fragment>;
}
