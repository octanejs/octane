import type { Editor } from '@tiptap/core';
import { deepEqual } from 'fast-equals';
import { useDebugValue, useEffect, useLayoutEffect, useState } from 'octane';

import { splitSlot, subSlot } from './internal';
import { useSyncExternalStoreWithSelector } from './useSyncExternalStoreWithSelector';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export type EditorStateSnapshot<TEditor extends Editor | null = Editor | null> = {
	editor: TEditor;
	transactionNumber: number;
};

export type UseEditorStateOptions<
	TSelectorResult,
	TEditor extends Editor | null = Editor | null,
> = {
	/** The editor instance to observe. */
	editor: TEditor;
	/** Select the value that should drive component re-renders. */
	selector: (context: EditorStateSnapshot<TEditor>) => TSelectorResult;
	/** @default `deepEqual` from `fast-equals`. */
	equalityFn?: (left: TSelectorResult, right: TSelectorResult | null) => boolean;
};

/**
 * Synchronizes a TipTap editor's transactions with a stable external-store
 * snapshot, independently of component re-renders.
 */
class EditorStateManager<TEditor extends Editor | null = Editor | null> {
	private transactionNumber = 0;

	private lastTransactionNumber = 0;

	private lastSnapshot: EditorStateSnapshot<TEditor>;

	private editor: TEditor;

	private subscribers = new Set<() => void>();

	constructor(initialEditor: TEditor) {
		this.editor = initialEditor;
		this.lastSnapshot = { editor: initialEditor, transactionNumber: 0 };

		this.getSnapshot = this.getSnapshot.bind(this);
		this.getServerSnapshot = this.getServerSnapshot.bind(this);
		this.watch = this.watch.bind(this);
		this.subscribe = this.subscribe.bind(this);
	}

	getSnapshot(): EditorStateSnapshot<TEditor> {
		if (this.transactionNumber === this.lastTransactionNumber) {
			return this.lastSnapshot;
		}

		this.lastTransactionNumber = this.transactionNumber;
		this.lastSnapshot = { editor: this.editor, transactionNumber: this.transactionNumber };
		return this.lastSnapshot;
	}

	getServerSnapshot(): EditorStateSnapshot<null> {
		return { editor: null, transactionNumber: 0 };
	}

	subscribe(callback: () => void): () => void {
		this.subscribers.add(callback);
		return () => {
			this.subscribers.delete(callback);
		};
	}

	watch(nextEditor: Editor | null): undefined | (() => void) {
		this.editor = nextEditor as TEditor;

		if (!this.editor) {
			return undefined;
		}

		const onTransaction = () => {
			this.transactionNumber += 1;
			this.subscribers.forEach((callback) => callback());
		};
		const currentEditor = this.editor;

		currentEditor.on('transaction', onTransaction);
		return () => {
			currentEditor.off('transaction', onTransaction);
		};
	}
}

export function useEditorState<TSelectorResult>(
	options: UseEditorStateOptions<TSelectorResult, Editor>,
): TSelectorResult;
export function useEditorState<TSelectorResult>(
	options: UseEditorStateOptions<TSelectorResult, Editor | null>,
): TSelectorResult | null;
export function useEditorState<TSelectorResult>(
	options:
		| UseEditorStateOptions<TSelectorResult, Editor>
		| UseEditorStateOptions<TSelectorResult, Editor | null>,
	...args: [slot?: symbol]
): TSelectorResult | null {
	const [, slot] = splitSlot(args);
	const [editorStateManager] = useState(
		() => new EditorStateManager(options.editor),
		subSlot(slot, 'editor-state:manager'),
	);

	const selectedState = useSyncExternalStoreWithSelector(
		editorStateManager.subscribe,
		editorStateManager.getSnapshot,
		editorStateManager.getServerSnapshot,
		options.selector as UseEditorStateOptions<TSelectorResult, Editor | null>['selector'],
		options.equalityFn ?? deepEqual,
		subSlot(slot, 'editor-state:selector'),
	);

	useIsomorphicLayoutEffect(
		() => editorStateManager.watch(options.editor),
		[options.editor, editorStateManager],
		subSlot(slot, 'editor-state:watch'),
	);

	useDebugValue(selectedState, undefined, subSlot(slot, 'editor-state:debug'));

	return selectedState;
}
