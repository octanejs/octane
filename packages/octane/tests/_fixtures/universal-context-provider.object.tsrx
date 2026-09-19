import { createContext, useContext, useState, type Context } from 'octane';
import { ImportedDomContext, ImportedNativeContext } from './universal-context-values';

declare module 'octane/jsx-runtime' {
	namespace Octane {
		namespace JSX {
			interface IntrinsicElements {
				status: { value: string; count: number; increment: () => void };
			}
		}
	}
}

export type ContextProviderProps = {
	contextKey: string;
	value: string;
	initial: number;
	native?: boolean;
};

const LocalContext = createContext('default');

function Consumer(props: { context: Context<string>; initial: number }) @{
	const value = useContext(props.context);
	const [count, setCount] = useState(props.initial);
	<status value={value} count={count} increment={() => setCount((previous) => previous + 1)} />
}

export function LocalContextProvider(props: ContextProviderProps) @{
	<LocalContext key={props.contextKey} value={props.value}>
		<Consumer context={LocalContext} initial={props.initial} />
	</LocalContext>
}

export function SpreadContextProvider(props: ContextProviderProps) @{
	<LocalContext {...{ key: props.contextKey, value: props.value }}>
		<Consumer context={LocalContext} initial={props.initial} />
	</LocalContext>
}

export function ImportedContextProvider(props: ContextProviderProps) @{
	// The authored JSX checker uses the DOM signature; this fixture compiles to
	// the object renderer, whose context provider accepts the same authored props.
	const Context = (props.native ? ImportedNativeContext : ImportedDomContext) as unknown as Context<
		string
	>;
	<Context key={props.contextKey} value={props.value}>
		<Consumer context={Context} initial={props.initial} />
	</Context>
}
