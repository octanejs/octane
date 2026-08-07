/** @jsxImportSource octane */

import { createContext, useContext, useState } from 'octane';

const Ctx = createContext<number>(0);
const Unrelated = createContext<number>(0);

// Records the identity of the callback its owner created for it.
export function Consumer(props: { cb: () => void; seen: Array<() => void> }) {
	const n = useContext(Ctx);
	props.seen.push(props.cb);
	return <span data-role="consumer">{n}</span>;
}

// Publishes the context around the children it was handed.
export function ContextHost(props: { children: any; bind: (fn: () => void) => void }) {
	const [n, setN] = useState(0);
	props.bind(() => setN((v) => v + 1));
	return <Ctx value={n}>{props.children}</Ctx>;
}

// Publishes an unrelated context, so its updates must not reach the tree above.
export function UnrelatedHost(props: { children: any; bind: (fn: () => void) => void }) {
	const [n, setN] = useState(0);
	props.bind(() => setN((v) => v + 1));
	return <Unrelated value={n}>{props.children}</Unrelated>;
}

// Reads the context lazily through a prop, which is what forces a rebuild.
const lazy = {
	get current(): number {
		return useContext(Ctx);
	},
};

export function LazyReader(props: { value: number }) {
	return <span data-role="lazy">{props.value}</span>;
}

// The owner renders exactly once, so every identity it creates must survive.
export function Owner(props: {
	seen: Array<() => void>;
	bind: (fn: () => void) => void;
	bindUnrelated: (fn: () => void) => void;
}) {
	((globalThis as any).__SCOPED_OWNER_RENDERS ??= { n: 0 }).n++;
	return (
		<UnrelatedHost bind={props.bindUnrelated}>
			<ContextHost bind={props.bind}>
				<Consumer cb={() => {}} seen={props.seen} />
				<LazyReader value={lazy.current} />
			</ContextHost>
		</UnrelatedHost>
	);
}
