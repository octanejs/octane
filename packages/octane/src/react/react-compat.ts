/** @jsxImportSource octane */
/** A real React root owned by one committed Octane boundary. */
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import {
	createElement,
	descriptorChildren,
	useEffect,
	useId,
	useInsertionEffect,
	useLayoutEffect,
	useState,
	type OctaneNode,
} from '../index.js';
import {
	getRendererOwnerVisibility,
	readContextFromScope,
	reportRendererOwnerError,
	useRendererThenable,
	type Context,
	type Scope,
} from '../runtime.js';
import {
	createReactCompatTree,
	isReactCompatErrorBoundary,
	type ReactCompatContextValue,
	type ReactCompatObserver,
	type ReactCompatVisibility,
} from './react-compat-envelope.js';
import {
	createReactIslandElement,
	resolveReactIsland,
	validateReactContextBridges,
	type ReactCompatComponentProps,
	type ReactCompatClassComponentProps,
	type ReactCompatProps,
	type ReactContextBridge,
	type TransportedReactChild,
} from './react-compat-shared.js';

const CONTROLLER_SLOT = Symbol('octane.react-compat.controller');
const INVALIDATE_SLOT = Symbol('octane.react-compat.invalidate');
const ID_SLOT = Symbol('octane.react-compat.id');
const LIFETIME_SLOT = Symbol('octane.react-compat.lifetime');
const VISIBILITY_SLOT = Symbol('octane.react-compat.visibility');
const ACTIVITY_SLOT = Symbol('octane.react-compat.activity');
const PUBLISH_SLOT = Symbol('octane.react-compat.publish');
const SENTINEL_COMMENT = 'react-compat';
const SENTINEL = Object.freeze({ __html: `<!--${SENTINEL_COMMENT}-->` });

function equalProps(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	for (const key of keys) {
		if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) return false;
	}
	return true;
}

class ReactIslandController {
	status: 0 | 1 | 2 = 0;
	payload: unknown = null;
	notify: () => void = () => {};
	private host: HTMLDivElement | null = null;
	private root: Root | null = null;
	private disposed = false;
	private child: TransportedReactChild | null = null;
	private contexts: readonly ReactCompatContextValue[] = [];
	private mappings: readonly ReactContextBridge<any>[] | null = null;
	private visibility: ReactCompatVisibility = 'visible';
	private settle: (() => void) | null = null;
	private observer: ReactCompatObserver = {
		pending: (visibility) => {
			// Capture the fallback's commit cause before deferring. A queued park
			// notification must not become a resource suspension after host reveal.
			if (visibility === 'visible') this.signal('pending');
		},
		ready: () => this.signal('ready'),
		error: (error) => this.signal('error', error),
	};

	constructor(private scope: Scope) {}

	readonly ref = (host: HTMLDivElement | null): void => {
		// Octane disconnects refs on visibility changes as well as deletion.
		// The insertion-effect lifetime below is the authoritative disposal.
		if (host !== null && !this.disposed) this.host = host;
	};

	readContexts(mappings: readonly ReactContextBridge<any>[]): ReactCompatContextValue[] {
		const previous = this.mappings;
		if (previous === null)
			this.mappings = mappings.map(({ source, target }) => ({ source, target }));
		else if (
			previous.length !== mappings.length ||
			previous.some(
				(entry, index) =>
					entry.source !== mappings[index].source || entry.target !== mappings[index].target,
			)
		) {
			throw new Error(
				'<ReactCompat> context mapping identities and order must stay stable; change the boundary key to replace them.',
			);
		}
		return mappings.map(({ source, target }) => {
			if (!('$$version' in source) || typeof source.$$version !== 'number') {
				throw new TypeError(
					'<ReactCompat> client rendering requires a native client Octane context.',
				);
			}
			return {
				context: target,
				value: readContextFromScope(this.scope, source as Context<any>),
			};
		});
	}

	private signal(kind: 'pending' | 'ready' | 'error', error?: unknown): void {
		// React may call this from insertion/layout/passive commit work. Never
		// re-enter the native renderer until that React commit has finished.
		queueMicrotask(() => {
			if (this.disposed) {
				if (kind === 'error') reportRendererOwnerError(this.scope, error);
				return;
			}
			if (this.status === 2) return;
			if (kind === 'error') {
				this.status = 2;
				this.payload = error;
			} else if (kind === 'pending') {
				// An outer host hide is not a new escaped resource suspension.
				if (this.visibility !== 'visible' || this.status === 1) return;
				this.status = 1;
				this.payload = new Promise<void>((resolve) => {
					this.settle = resolve;
				});
			} else {
				if (this.visibility === 'suspense' || this.status === 0) return;
				this.status = 0;
				this.payload = null;
			}
			const settle = kind === 'pending' ? null : this.settle;
			if (kind !== 'pending') this.settle = null;
			this.notify();
			settle?.();
		});
	}

	commit(
		child: TransportedReactChild,
		contexts: readonly ReactCompatContextValue[],
		identifierPrefix: string,
	): void {
		if (this.disposed || this.host === null) return;
		const previous = this.child;
		if (
			previous !== null &&
			previous.type === child.type &&
			previous.key === child.key &&
			equalProps(previous.props, child.props) &&
			this.contexts.every((entry, index) => Object.is(entry.value, contexts[index].value))
		)
			return;
		this.child = child;
		this.contexts = contexts;
		const tree = this.tree();
		if (this.root === null) {
			const options = {
				identifierPrefix,
				onUncaughtError: (error: unknown) => this.signal('error', error),
				onCaughtError: (error: unknown, info: { errorBoundary?: unknown }) => {
					if (!isReactCompatErrorBoundary(info.errorBoundary)) console.error(error);
				},
			};
			const first = this.host.firstChild;
			const serverMarkup =
				first !== null &&
				!(
					first.nodeType === 8 &&
					(first as Comment).data === SENTINEL_COMMENT &&
					first.nextSibling === null
				);
			if (serverMarkup) this.root = hydrateRoot(this.host, tree, options);
			else {
				this.root = createRoot(this.host, options);
				this.root.render(tree);
			}
		} else this.root.render(tree);
	}

	private tree() {
		return createReactCompatTree(
			createReactIslandElement(this.child!),
			this.contexts,
			this.observer,
			this.visibility,
		);
	}

	visibilityChanged(): void {
		if (this.disposed) return;
		let visibility = getRendererOwnerVisibility(this.scope);
		// React's own boundary is already hiding this primary. Parking it a
		// second time would prevent its resource retry from ever revealing.
		if (visibility === 'suspense' && this.status === 1) visibility = 'visible';
		if (visibility === this.visibility) return;
		this.visibility = visibility;
		if (this.root !== null) this.root.render(this.tree());
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.settle?.();
		this.settle = null;
		this.payload = null;
		this.notify = () => {};
		const root = this.root;
		this.root = null;
		this.host = null;
		this.child = null;
		this.contexts = [];
		this.mappings = null;
		// A React→Octane→React deletion may begin inside a React commit. The
		// root is invalidated immediately; unmount after the enclosing commit.
		if (root !== null)
			queueMicrotask(() => {
				try {
					root.unmount();
				} catch (error) {
					reportRendererOwnerError(this.scope, error);
				}
			});
	}
}

function ReactCompatImpl<C extends import('react').ComponentClass<any>>(
	props: ReactCompatClassComponentProps<C>,
): OctaneNode;
function ReactCompatImpl<P>(props: ReactCompatComponentProps<P>): OctaneNode;
function ReactCompatImpl(props: ReactCompatProps): OctaneNode;
function ReactCompatImpl(
	props: ReactCompatProps | ReactCompatComponentProps<unknown>,
	scope?: Scope,
): OctaneNode {
	const [controller] = useState(() => new ReactIslandController(scope!), CONTROLLER_SLOT);
	const [, invalidate] = useState(0, INVALIDATE_SLOT);
	controller.notify = () => invalidate((value) => value + 1);
	// Only the committed layout publishes these render-local snapshots.
	const child = resolveReactIsland(props);
	const contexts = controller.readContexts(validateReactContextBridges(props.contexts));
	const identifierPrefix = `react-compat-${useId(ID_SLOT)}`;
	if (controller.status === 2) throw controller.payload;
	if (controller.status === 1) useRendererThenable(controller.payload as Promise<void>);
	useInsertionEffect(() => () => controller.dispose(), [], LIFETIME_SLOT);
	useLayoutEffect(
		() => {
			controller.visibilityChanged();
			return () => controller.visibilityChanged();
		},
		[],
		VISIBILITY_SLOT,
	);
	// Activity can hide a primary whose layout effects were already disconnected
	// by Suspense. Its passive disconnect is the additional visibility signal.
	useEffect(
		() => {
			controller.visibilityChanged();
			return () => controller.visibilityChanged();
		},
		[],
		ACTIVITY_SLOT,
	);
	useLayoutEffect(() => controller.commit(child, contexts, identifierPrefix), null, PUBLISH_SLOT);
	return createElement('div', {
		'data-react-compat': '',
		ref: controller.ref,
		suppressHydrationWarning: true,
		dangerouslySetInnerHTML: SENTINEL,
	});
}

/** Host one React component under Octane, with real React hooks and events. */
export const ReactCompat = descriptorChildren(ReactCompatImpl);
