// This is an actual TSRX program, checked with tsrx-tsc. The companion TSX
// type test pins invalid props with @ts-expect-error without relying on the
// virtual source transform retaining TypeScript comment directives.
import { createContext, useRef, useState } from 'octane';
import { ReactCompat, bridgeReactContext } from 'octane/react';
import { ReactCompat as ServerReactCompat } from 'octane/react/server';
import { createContext as createReactContext } from 'react';
import {
	Counter,
	ClassCounter,
	ForwardedCounter,
	LazyCounter,
	MemoCounter,
} from '../react-compat-components.react.js';

const Theme = createContext('light');
const ReactTheme = createReactContext('light');
const contexts = [bridgeReactContext(Theme, ReactTheme)] as const;

export function PrimaryChild() @{
	const input = useRef<HTMLInputElement | null>(null);
	const [reported, setReported] = useState(0);

	<Theme value="dark">
		<ReactCompat contexts={contexts}>
			<Counter
				key="counter"
				label={'Count ' + reported}
				start={3}
				ref={input}
				onCount={(count) => setReported(Number(count.toFixed()))}
			/>
		</ReactCompat>
	</Theme>
}

export function ReactComponentKinds() @{
	const input = useRef<HTMLInputElement | null>(null);
	const instance = useRef<ClassCounter | null>(null);

	<section>
		<ReactCompat>
			<MemoCounter label="Memo" start={3} ref={input} />
		</ReactCompat>
		<ReactCompat>
			<LazyCounter label="Lazy" start={3} />
		</ReactCompat>
		<ReactCompat>
			<ForwardedCounter label="Ref" start={3} ref={input} />
		</ReactCompat>
		<ReactCompat>
			<ClassCounter label="Class" ref={instance} />
		</ReactCompat>
		<ReactCompat component={ClassCounter} props={{ label: 'Class transport', ref: instance }} />
	</section>
}

export function ComponentTransport() @{
	const input = useRef<HTMLInputElement | null>(null);

	<ReactCompat
		component={Counter}
		props={{ label: 'Transport', start: 3, ref: input, onCount: (count) => count.toFixed() }}
	/>
}

export function ServerChild() @{
	<ServerReactCompat>
		<Counter label="Server" start={3} />
	</ServerReactCompat>
}
