declare module '*.tsrx' {
	import type { Component } from 'octane';
	const component: Component<Record<string, unknown>>;
	export { component as App };
}
