/** @jsxImportSource octane */
/**
 * Compile-only public API pins. React components keep their own prop and ref
 * types in both Octane authoring forms; context mappings preserve value types.
 * The sibling react-compat/primary.test-d.tsrx exercises the actual TSRX source
 * entry with tsrx-tsc, separately from this ordinary TypeScript JSX program.
 */
import * as React from 'react';
import { createContext, type OctaneNode } from 'octane';
import {
	ReactCompat,
	bridgeReactContext,
	type ReactCompatComponentProps,
	type ReactContextBridge,
} from 'octane/react';
import { ReactCompat as ServerReactCompat } from 'octane/react/server';
import {
	Counter,
	ClassCounter,
	EmptyCounter,
	ForwardedCounter,
	LazyCounter,
	MemoCounter,
	OptionalCounter,
	type CounterProps,
} from './react-compat-components.react.js';

const inputRef = { current: null as HTMLInputElement | null };
const classRef = { current: null as ClassCounter | null };
const divRef = { current: document.createElement('div') };
const counterProps = { label: 'Count', start: 3 };
const stringHandler = (count: string) => count.toUpperCase();

export const childForm = (
	<ReactCompat>
		<Counter
			key="counter"
			label="Count"
			start={3}
			ref={inputRef}
			onCount={(count) => count.toFixed()}
		/>
	</ReactCompat>
);
export const childCallbackRef = (
	<ReactCompat>
		<Counter label="Count" start={3} ref={(element) => element?.focus()} />
	</ReactCompat>
);
export const childMemo = (
	<ReactCompat>
		<MemoCounter label="Count" start={3} ref={inputRef} />
	</ReactCompat>
);
export const childLazy = (
	<ReactCompat>
		<LazyCounter label="Count" start={3} />
	</ReactCompat>
);
export const childForwarded = (
	<ReactCompat>
		<ForwardedCounter label="Count" start={3} ref={inputRef} />
	</ReactCompat>
);
export const childClass = (
	<ReactCompat>
		<ClassCounter label="Count" />
	</ReactCompat>
);
export const childClassRef = (
	<ReactCompat>
		<ClassCounter label="Count" ref={classRef} />
	</ReactCompat>
);

// Child JSX erases component identity. The child's own call site still checks
// every prop; root shape (one component, not a DOM element) is checked at runtime.
export const childWrongType = (
	<ReactCompat>
		{/* @ts-expect-error — the React child's required prop retains its numeric type */}
		<Counter label="Count" start="3" />
	</ReactCompat>
);
export const childMissingProp = (
	<ReactCompat>
		{/* @ts-expect-error — required React child props do not become optional */}
		<Counter label="Count" />
	</ReactCompat>
);
export const childUnknownProp = (
	<ReactCompat>
		{/* @ts-expect-error — unknown React child props are rejected */}
		<Counter label="Count" start={3} typo />
	</ReactCompat>
);
export const childWrongRef = (
	<ReactCompat>
		{/* @ts-expect-error — a React input ref cannot target a div */}
		<Counter label="Count" start={3} ref={divRef} />
	</ReactCompat>
);
export const childWrongClassRef = (
	<ReactCompat>
		{/* @ts-expect-error — a class ref receives the component instance, not its DOM */}
		<ClassCounter label="Count" ref={inputRef} />
	</ReactCompat>
);

export const componentForm = (
	<ReactCompat
		component={Counter}
		props={{
			label: 'Count',
			start: 3,
			ref: inputRef,
			onCount: (count) => {
				const inferredNumber: number = count;
				// @ts-expect-error — contextual callback inference is number, never any
				const rejectedString: string = count;
				return inferredNumber.toFixed();
			},
		}}
	/>
);
export const componentMemo = (
	<ReactCompat component={MemoCounter} props={{ label: 'Count', start: 3 }} />
);
export const componentLazy = (
	<ReactCompat component={LazyCounter} props={{ label: 'Count', start: 3 }} />
);
export const componentForwarded = (
	<ReactCompat component={ForwardedCounter} props={{ label: 'Count', start: 3, ref: inputRef }} />
);
export const componentClass = <ReactCompat component={ClassCounter} props={{ label: 'Count' }} />;
export const componentClassRef = (
	<ReactCompat component={ClassCounter} props={{ label: 'Count', ref: classRef }} />
);
export const optionalProps = <ReactCompat component={OptionalCounter} />;
export const noProps = <ReactCompat component={EmptyCounter} />;
export const explicitPropsType: ReactCompatComponentProps<CounterProps> = {
	component: Counter,
	props: { label: 'Count', start: 3, ref: inputRef },
};

export const componentWrongType = (
	// @ts-expect-error — component inference does not widen from incorrect props
	<ReactCompat component={Counter} props={{ label: 'Count', start: '3' }} />
);
// @ts-expect-error — an island with required props requires the transport object
export const componentMissingProps = <ReactCompat component={Counter} />;
// @ts-expect-error — the required island prop is still checked within props
export const componentMissingProp = <ReactCompat component={Counter} props={{ label: 'Count' }} />;
export const componentUnknownProp = (
	// @ts-expect-error — unknown transported island props are rejected
	<ReactCompat component={Counter} props={{ label: 'Count', start: 3, typo: true }} />
);
export const componentWrongRef = (
	// @ts-expect-error — transported refs keep the React component's element type
	<ReactCompat component={Counter} props={{ ...counterProps, ref: divRef }} />
);
export const componentWrongClassRef = (
	// @ts-expect-error — a transported class ref keeps the instance type
	<ReactCompat component={ClassCounter} props={{ label: 'Count', ref: inputRef }} />
);
export const componentWrongClassProp = (
	// @ts-expect-error — the class-specific ref overload keeps ordinary props typed
	<ReactCompat component={ClassCounter} props={{ label: 3 }} />
);
// @ts-expect-error — a class with required props still requires its transport object
export const componentMissingClassProps = <ReactCompat component={ClassCounter} />;
export const componentUnknownClassProp = (
	// @ts-expect-error — the class-specific overload rejects extra props
	<ReactCompat component={ClassCounter} props={{ label: 'Count', typo: true }} />
);
export const componentWrongCallback = (
	// @ts-expect-error — the callback parameter remains a number
	<ReactCompat component={Counter} props={{ ...counterProps, onCount: stringHandler }} />
);
export const mixedForms = (
	// @ts-expect-error — the two authoring forms are mutually exclusive
	<ReactCompat component={Counter} props={{ label: 'Count', start: 3 }}>
		<Counter label="Count" start={3} />
	</ReactCompat>
);
export const detachedProps = (
	// @ts-expect-error — props without a component are not an authoring form
	<ReactCompat props={{ start: 3 }}>
		<Counter label="Count" start={3} />
	</ReactCompat>
);
// @ts-expect-error — a missing island is rejected
export const emptyBoundary = <ReactCompat />;

const Theme = createContext('light');
const ReactTheme = React.createContext('light');
const themeBridge: ReactContextBridge<string> = bridgeReactContext(Theme, ReactTheme);
const contextMappings = [themeBridge] as const;
export const sharedContext = (
	<ReactCompat
		contexts={contextMappings}
		component={Counter}
		props={{ label: 'Count', start: 3 }}
	/>
);
// @ts-expect-error — source context values determine the target context type
export const wrongContextValue = bridgeReactContext(Theme, React.createContext(0));
// @ts-expect-error — the mapping direction is native Octane to real React
export const wrongContextSource = bridgeReactContext(ReactTheme, ReactTheme);
// @ts-expect-error — an Octane context cannot stand in for the React target
export const wrongContextTarget = bridgeReactContext(Theme, Theme);
// @ts-expect-error — consumers cannot change a context mapping's identities
themeBridge.source = createContext('dark');

// Client and server exports expose the same authored overloads.
export const serverChild = (
	<ServerReactCompat>
		<Counter label="Count" start={3} ref={inputRef} />
	</ServerReactCompat>
);
export const serverComponent = (
	<ServerReactCompat component={Counter} props={{ label: 'Count', start: 3, ref: inputRef }} />
);
export const serverClassRef = (
	<ServerReactCompat component={ClassCounter} props={{ label: 'Count', ref: classRef }} />
);
export const serverWrongClassRef = (
	// @ts-expect-error — server transport uses the same class ref type
	<ServerReactCompat component={ClassCounter} props={{ label: 'Count', ref: inputRef }} />
);
export const serverSurface: typeof ReactCompat = ServerReactCompat;
export const clientSurface: typeof ServerReactCompat = ReactCompat;
export const renderable: OctaneNode = childForm;
