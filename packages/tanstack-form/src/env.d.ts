// Octane's `.tsrx` tooling supplies JSX types in editors. This standalone
// ambient namespace lets package typechecking run without React's types.
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
