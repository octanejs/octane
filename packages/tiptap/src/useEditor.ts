import { type EditorOptions, Editor } from '@tiptap/core';
import { useDebugValue, useEffect, useRef, useState, useSyncExternalStore } from 'octane';

import { splitSlot, subSlot } from './internal';
import { useEditorState, type UseEditorStateOptions } from './useEditorState';

type DependencyList = readonly unknown[];
type MutableRefObject<T> = { current: T };

const isDev = process.env.NODE_ENV !== 'production';
const isSSR = typeof window === 'undefined';
const isNext = isSSR || Boolean(typeof window !== 'undefined' && (window as any).next);

export type UseEditorOptions = Partial<EditorOptions> & {
	/**
	 * Whether to create the editor during the first render. Set this to `false`
	 * for server-rendered applications.
	 * @default true
	 */
	immediatelyRender?: boolean;
	/**
	 * Whether every editor transaction should re-render the component.
	 * @default false
	 */
	shouldRerenderOnTransaction?: boolean;
};

const editorCallbackOptions = new Set<keyof UseEditorOptions>([
	'onBeforeCreate',
	'onBlur',
	'onCreate',
	'onDestroy',
	'onFocus',
	'onSelectionUpdate',
	'onTransaction',
	'onUpdate',
	'onContentError',
	'onDrop',
	'onPaste',
	'onDelete',
	'onMount',
	'onUnmount',
]);

/** Manages editor creation, option updates, recreation, and deferred teardown. */
class EditorInstanceManager {
	private editor: Editor | null = null;

	private options: MutableRefObject<UseEditorOptions>;

	private subscriptions = new Set<() => void>();

	private scheduledDestructionTimeout: ReturnType<typeof setTimeout> | undefined;

	private isComponentMounted = false;

	private previousDeps: DependencyList | null = null;

	public instanceId = '';

	constructor(options: MutableRefObject<UseEditorOptions>) {
		this.options = options;
		this.setEditor(this.getInitialEditor());
		this.scheduleDestroy();

		this.getEditor = this.getEditor.bind(this);
		this.getServerSnapshot = this.getServerSnapshot.bind(this);
		this.subscribe = this.subscribe.bind(this);
		this.refreshEditorInstance = this.refreshEditorInstance.bind(this);
		this.scheduleDestroy = this.scheduleDestroy.bind(this);
		this.onRender = this.onRender.bind(this);
		this.createEditor = this.createEditor.bind(this);
	}

	private setEditor(editor: Editor | null): void {
		this.editor = editor;
		this.instanceId = Math.random().toString(36).slice(2, 9);
		this.subscriptions.forEach((callback) => callback());
	}

	private getInitialEditor(): Editor | null {
		const explicit = this.options.current.immediatelyRender;
		let immediatelyRender = explicit ?? true;

		if (isSSR) {
			if (immediatelyRender && isDev) {
				console.warn(
					'SSR detected. `immediatelyRender` has been set to false to avoid hydration mismatches',
				);
			}
			immediatelyRender = false;
		} else if (isNext && explicit === undefined) {
			immediatelyRender = false;
			if (isDev) {
				console.warn(
					'Next.js detected. `immediatelyRender` defaults to false to avoid hydration mismatches. Pass `immediatelyRender: true` explicitly if you are rendering the editor only on the client.',
				);
			}
		}

		return immediatelyRender ? this.createEditor() : null;
	}

	private createEditor(): Editor {
		const optionsToApply: Partial<EditorOptions> = {
			...this.options.current,
			onBeforeCreate: (...args) => this.options.current.onBeforeCreate?.(...args),
			onBlur: (...args) => this.options.current.onBlur?.(...args),
			onCreate: (...args) => this.options.current.onCreate?.(...args),
			onDestroy: (...args) => this.options.current.onDestroy?.(...args),
			onFocus: (...args) => this.options.current.onFocus?.(...args),
			onSelectionUpdate: (...args) => this.options.current.onSelectionUpdate?.(...args),
			onTransaction: (...args) => this.options.current.onTransaction?.(...args),
			onUpdate: (...args) => this.options.current.onUpdate?.(...args),
			onContentError: (...args) => this.options.current.onContentError?.(...args),
			onDrop: (...args) => this.options.current.onDrop?.(...args),
			onPaste: (...args) => this.options.current.onPaste?.(...args),
			onDelete: (...args) => this.options.current.onDelete?.(...args),
			onMount: (...args) => this.options.current.onMount?.(...args),
			onUnmount: (...args) => this.options.current.onUnmount?.(...args),
		};

		return new Editor(optionsToApply);
	}

	getEditor(): Editor | null {
		return this.editor;
	}

	getServerSnapshot(): null {
		return null;
	}

	subscribe(onStoreChange: () => void): () => void {
		this.subscriptions.add(onStoreChange);
		return () => {
			this.subscriptions.delete(onStoreChange);
		};
	}

	static compareOptions(left: UseEditorOptions, right: UseEditorOptions): boolean {
		return (Object.keys(left) as (keyof UseEditorOptions)[]).every((key) => {
			if (editorCallbackOptions.has(key)) {
				return true;
			}

			if (key === 'extensions' && left.extensions && right.extensions) {
				return (
					left.extensions.length === right.extensions.length &&
					left.extensions.every((extension, index) => extension === right.extensions?.[index])
				);
			}

			return left[key] === right[key];
		});
	}

	onRender(deps: DependencyList): () => () => void {
		return () => {
			this.isComponentMounted = true;
			clearTimeout(this.scheduledDestructionTimeout);

			if (this.editor && !this.editor.isDestroyed && deps.length === 0) {
				if (!EditorInstanceManager.compareOptions(this.options.current, this.editor.options)) {
					this.editor.setOptions({
						...this.options.current,
						editable: this.editor.isEditable,
					});
				}
			} else {
				this.refreshEditorInstance(deps);
			}

			return () => {
				this.isComponentMounted = false;
				this.scheduleDestroy();
			};
		};
	}

	private refreshEditorInstance(deps: DependencyList): void {
		if (this.editor && !this.editor.isDestroyed) {
			if (this.previousDeps === null) {
				this.previousDeps = deps;
				return;
			}

			const depsAreEqual =
				this.previousDeps.length === deps.length &&
				this.previousDeps.every((dependency, index) => dependency === deps[index]);
			if (depsAreEqual) {
				return;
			}
		}

		if (this.editor && !this.editor.isDestroyed) {
			this.editor.destroy();
		}

		this.setEditor(this.createEditor());
		this.previousDeps = deps;
	}

	private scheduleDestroy(): void {
		const currentInstanceId = this.instanceId;
		const currentEditor = this.editor;

		// Re-arming replaces any pending destruction timer so two can never race.
		clearTimeout(this.scheduledDestructionTimeout);
		this.scheduledDestructionTimeout = setTimeout(() => {
			this.scheduledDestructionTimeout = undefined;

			// This timer outlives the owning component by a tick, so it can fire
			// after the DOM environment the editor lives in is gone (e.g. a test
			// runner disposing jsdom between files). Touching the editor then would
			// crash inside prosemirror-view's `window` access, and there is nothing
			// left to release anyway.
			if (typeof window === 'undefined') {
				return;
			}

			if (this.isComponentMounted && this.instanceId === currentInstanceId) {
				currentEditor?.setOptions(this.options.current);
				return;
			}

			if (currentEditor && !currentEditor.isDestroyed) {
				currentEditor.destroy();
				if (this.instanceId === currentInstanceId) {
					this.setEditor(null);
				}
			}
		}, 1);
	}
}

export function useEditor(
	options: UseEditorOptions & { immediatelyRender: false },
	deps?: DependencyList,
): Editor | null;
export function useEditor(options: UseEditorOptions, deps?: DependencyList): Editor;
export function useEditor(
	...args: [options?: UseEditorOptions, deps?: DependencyList, slot?: symbol]
): Editor | null {
	const [userArgs, slot] = splitSlot(args);
	const options = (userArgs[0] as UseEditorOptions | undefined) ?? {};
	const deps = (userArgs[1] as DependencyList | undefined) ?? [];
	const mostRecentOptions = useRef(options, subSlot(slot, 'editor:options'));

	mostRecentOptions.current = options;

	const [instanceManager] = useState(
		() => new EditorInstanceManager(mostRecentOptions),
		subSlot(slot, 'editor:manager'),
	);
	const editor = useSyncExternalStore(
		instanceManager.subscribe,
		instanceManager.getEditor,
		instanceManager.getServerSnapshot,
		subSlot(slot, 'editor:store'),
	);

	useDebugValue(editor, undefined, subSlot(slot, 'editor:debug'));

	// TipTap intentionally performs this lifecycle pass after every render. In
	// Octane, `null` is the explicit opt-out from inferred dependency arrays.
	useEffect(instanceManager.onRender(deps), null, subSlot(slot, 'editor:lifecycle'));

	const useEditorStateWithSlot = useEditorState as <TSelectorResult>(
		options: UseEditorStateOptions<TSelectorResult, Editor | null>,
		slot: symbol,
	) => TSelectorResult | null;
	useEditorStateWithSlot(
		{
			editor,
			selector: ({ transactionNumber }) => {
				if (
					options.shouldRerenderOnTransaction === false ||
					options.shouldRerenderOnTransaction === undefined
				) {
					return null;
				}

				if (options.immediatelyRender && transactionNumber === 0) {
					return 0;
				}

				return transactionNumber + 1;
			},
		},
		subSlot(slot, 'editor:state'),
	);

	return editor;
}
