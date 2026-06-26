import { Provider, Inner } from './interop-provider.tsrx';

// React-style `.tsx` parent passing a single component child to a `.tsrx`
// `{props.children}` consumer.
export function App() {
	return (
		<Provider>
			<Inner />
		</Provider>
	);
}

// `.tsx` parent passing a single HOST element child.
export function HostChildApp() {
	return (
		<Provider>
			<span class="h">x</span>
		</Provider>
	);
}

// `.tsx` parent passing MULTIPLE children (component + host).
export function MultiChildApp() {
	return (
		<Provider>
			<Inner />
			<span class="h">x</span>
		</Provider>
	);
}
