/**
 * A synthetic adapter for the published compiler/writer contract. It records
 * writes; it does not implement a native renderer, reconciliation, or a host
 * runtime. Keys and hook slots are opaque tokens owned by this test adapter.
 */
export interface WrittenNode {
	tag: string;
	key: string | undefined;
	props: Record<string, any>;
	children: WrittenNode[];
}

interface Prototype {
	tag: string;
	props: Record<string, any>;
}

type Component = (props: any) => void;

interface TokenTree {
	children: Map<unknown, TokenTree>;
	value?: any;
}

function tokenTree(): TokenTree {
	return { children: new Map() };
}

function entry(tree: TokenTree, path: unknown[]): TokenTree {
	for (const token of path) {
		let child = tree.children.get(token);
		if (child === undefined) tree.children.set(token, (child = tokenTree()));
		tree = child;
	}
	return tree;
}

function propsFromPairs(pairs: any[] | undefined): Record<string, any> {
	const props: Record<string, any> = {};
	for (let i = 0; i < (pairs?.length ?? 0); i += 2) props[pairs![i]] = pairs![i + 1];
	return props;
}

export function createWriterRecorder() {
	let roots: WrittenNode[] = [];
	const elements: WrittenNode[] = [];
	const components: Array<{ component: Component; props: Record<string, any> }> = [];
	const path: unknown[] = [];
	const hooksAllowed: boolean[] = [];
	const registered = new Set<Component>();
	const keys = tokenTree();
	const hooks = tokenTree();
	let nextKey = 0;
	let nextSlot = 0;
	const effects: Array<{ create: () => unknown; deps: readonly unknown[] | null }> = [];

	const current = () => {
		const node = elements.at(-1);
		if (node === undefined) throw new Error('No open writer element');
		return node;
	};
	const setAttribute = (name: string, value: unknown) => {
		current().props[name] = value;
	};
	const typedAttribute = (kind: string) => (name: string, value: unknown) => {
		if (value !== null && value !== undefined && typeof value !== kind)
			throw new TypeError(`Expected a ${kind} writer value for ${name}`);
		if (name === '$onLayout') throw new TypeError('$onLayout requires the generic writer');
		setAttribute(name, value);
	};
	const currentComponent = () => {
		const component = components.at(-1);
		if (component === undefined) throw new Error('No open writer component');
		return component;
	};
	const hook = (slot: unknown) => {
		if (!hooksAllowed.at(-1)) throw new Error('Hook requires a component registered with hooks');
		if (slot === undefined) throw new Error('Hook requires a compiler-assigned slot');
		return entry(hooks, [...path, slot]);
	};
	const state = (initial: any, slot: unknown) => {
		const cell = hook(slot);
		cell.value ??= { current: typeof initial === 'function' ? initial() : initial };
		return [
			cell.value.current,
			(next: any) => {
				cell.value.current = typeof next === 'function' ? next(cell.value.current) : next;
			},
			() => cell.value.current,
		];
	};
	const memo = (
		calculate: (...args: any[]) => any,
		deps: readonly unknown[] | null,
		slot: unknown,
	) => {
		const cell = hook(slot);
		const previous = cell.value;
		if (
			previous === undefined ||
			deps === null ||
			previous.deps === null ||
			deps.length !== previous.deps.length ||
			deps.some((value, index) => !Object.is(value, previous.deps[index]))
		)
			cell.value = { current: calculate(...(deps ?? [])), deps };
		return cell.value.current;
	};

	const adapter = {
		assertValdiCompilerAbi(version: number) {
			if (version !== 1) throw new Error(`Unsupported writer ABI ${version}`);
		},
		jsx: {
			makeNodePrototype(tag: string, pairs: any[] | undefined): Prototype {
				return { tag, props: propsFromPairs(pairs) };
			},
			makeComponentPrototype(pairs: any[] | undefined): Prototype {
				return { tag: 'component', props: propsFromPairs(pairs) };
			},
			beginRender(prototype: Prototype, key: string | undefined) {
				const node = { tag: prototype.tag, key, props: { ...prototype.props }, children: [] };
				if (elements.length === 0) roots.push(node);
				else current().children.push(node);
				elements.push(node);
				path.push(key ?? prototype);
			},
			endRender() {
				if (elements.pop() === undefined) throw new Error('Unbalanced writer element');
				path.pop();
			},
			setAttribute,
			setAttributeBool: typedAttribute('boolean'),
			setAttributeNumber: typedAttribute('number'),
			setAttributeString: typedAttribute('string'),
			setAttributeFunction: typedAttribute('function'),
			setAttributeStyle: setAttribute,
			beginComponent(component: Component, prototype: Prototype, key: string | undefined) {
				components.push({ component, props: { ...prototype.props } });
				path.push(key ?? prototype);
			},
			setViewModelProperty(name: string, value: unknown) {
				currentComponent().props[name] = value;
			},
			setViewModelFull(props: Record<string, any>) {
				currentComponent().props = props;
			},
			endComponent() {
				const frame = components.pop();
				if (frame === undefined) throw new Error('Unbalanced writer component');
				try {
					frame.component(frame.props);
				} finally {
					path.pop();
				}
			},
		},
		defineValdiComponent(body: Component, options: { hasHooks: boolean }): Component {
			const component = (props: any) => {
				path.push(component);
				hooksAllowed.push(options.hasHooks);
				try {
					body(props);
				} finally {
					hooksAllowed.pop();
					path.pop();
				}
			};
			registered.add(component);
			return component;
		},
		getValdiComponentConstructor(component: Component): Component {
			if (!registered.has(component)) throw new Error('Unregistered writer component');
			return component;
		},
		valdiKey(prototype: Prototype, ...parts: unknown[]): string {
			const key = entry(keys, [prototype, ...parts]);
			return (key.value ??= `test-key-${nextKey++}`);
		},
		setValdiAttributes(props: Record<string, any>) {
			Object.assign(current().props, props);
		},
		hookSlots(count: number) {
			const first = nextSlot;
			nextSlot += count;
			return first;
		},
		withSlot(slot: unknown, callback: (...args: any[]) => any, ...args: any[]) {
			path.push(slot);
			try {
				return callback(...args);
			} finally {
				path.pop();
			}
		},
		useState: state,
		__useStateWithGetter: state,
		useMemo: memo,
		useCallback(callback: (...args: any[]) => any, deps: readonly unknown[] | null, slot: unknown) {
			return memo(() => callback, deps, slot);
		},
		useRef(initial: unknown, slot: unknown) {
			return (hook(slot).value ??= { current: initial });
		},
		useLayoutEffect(create: () => unknown, deps: readonly unknown[] | null, slot: unknown) {
			hook(slot);
			effects.push({ create, deps });
		},
		__methodDep(object: Record<string, unknown>, name: string) {
			return object[name];
		},
	};

	return {
		adapter,
		effects,
		render(component: Component, props: Record<string, any> | undefined): WrittenNode[] {
			roots = [];
			effects.length = 0;
			try {
				component(props);
				if (elements.length !== 0 || components.length !== 0 || path.length !== 0)
					throw new Error('Writer did not close its output');
				return roots;
			} finally {
				elements.length = 0;
				components.length = 0;
				path.length = 0;
			}
		},
	};
}
