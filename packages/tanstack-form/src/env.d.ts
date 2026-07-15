// Octane's `.tsrx` tooling supplies JSX types in editors. This adapter keeps
// upstream's `.tsx` source layout, so it needs a small standalone ambient JSX
// namespace for package typechecking without depending on React's types.
declare namespace JSX {
	type Element = unknown;

	interface ElementClass {
		[name: string]: unknown;
	}

	interface ElementChildrenAttribute {
		children: {};
	}

	interface IntrinsicAttributes {
		key?: unknown;
	}

	interface IntrinsicElements {
		[name: string]: any;
	}
}
