// DOM lifecycle and portal-registry bridge ported from @tiptap/react 3.28.0.
import {
	createPortal,
	memo,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'octane';

function PortalEntry({ entry }) {
	return entry.portal;
}

/** Render every custom view in this EditorContent's logical Octane tree. */
function Portals({ contentComponent }) @{
	const renderers = useSyncExternalStore(
		contentComponent.subscribe,
		contentComponent.getSnapshot,
		contentComponent.getServerSnapshot,
	);
	const entries = Object.values(renderers);

	<>
		@for (const entry of entries; key entry.id) {
			<PortalEntry entry={entry} />
		}
	</>
}

/** Create the immutable external-store registry consumed by Portals. */
export function createContentComponent() {
	const subscribers = new Set();
	let renderers = {};
	let isNotificationQueued = false;

	const notifySubscribers = () => {
		if (isNotificationQueued || !subscribers.size) {
			return;
		}

		isNotificationQueued = true;
		queueMicrotask(() => {
			isNotificationQueued = false;
			subscribers.forEach((subscriber) => subscriber());
		});
	};

	return {
		subscribe(callback) {
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		getSnapshot() {
			return renderers;
		},
		getServerSnapshot() {
			return renderers;
		},
		setRenderer(id, renderer) {
			renderers = {
				...renderers,
				[id]: {
					id,
					portal: createPortal(renderer.reactElement, renderer.element),
				},
			};
			notifySubscribers();
		},
		removeRenderer(id) {
			const nextRenderers = { ...renderers };
			delete nextRenderers[id];
			renderers = nextRenderers;
			notifySubscribers();
		},
	};
}

export function PureEditorContent(props) @{
	const { editor, innerRef, ref, ...rest } = props;
	const editorContentRef = useRef(null);
	const [contentComponent, setContentComponent] = useState(null);

	useLayoutEffect(() => {
		if (!editor || editor.isDestroyed || editor.isEditorContentInitialized) {
			return;
		}

		const element = editorContentRef.current;
		const editorParent = editor.view.dom?.parentNode;

		if (!element || !editorParent) {
			return;
		}

		// The core Editor initially mounts into its own detached element. Move the
		// complete ProseMirror-owned subtree into Octane's committed host element;
		// moving nodes preserves the existing EditorView and DOM identity.
		element.append(...editorParent.childNodes);
		editor.setOptions({ element });

		// The registry must exist before createNodeViews: renderer factories publish
		// into it while ProseMirror builds the custom view instances.
		const nextContentComponent = createContentComponent();
		editor.contentComponent = nextContentComponent;
		editor.createNodeViews();
		editor.isEditorContentInitialized = true;
		setContentComponent(nextContentComponent);

		return () => {
			editor.isEditorContentInitialized = false;

			if (!editor.isDestroyed) {
				// ProseMirror destroys the live view instances here. Keep the registry
				// installed until their destroy methods have unregistered every portal.
				editor.view.setProps({ nodeViews: {}, markViews: {} });
			}

			editor.contentComponent = null;

			// Reset the editor to a detached element so the still-live instance can
			// safely be mounted by a later EditorContent. A view that has already
			// been destroyed or never mounted has nothing left to transfer.
			try {
				const currentParent = editor.view.dom?.parentNode;

				if (!currentParent) {
					return;
				}

				const detachedElement = document.createElement('div');
				detachedElement.append(...currentParent.childNodes);
				editor.setOptions({ element: detachedElement });
			} catch {
				// The editor may have been destroyed before this layout cleanup.
			}
		};
	}, [editor]);

	<>
		<div {...rest} ref={[ref, innerRef, editorContentRef]} />
		@if (contentComponent) {
			<Portals contentComponent={contentComponent} />
		}
	</>
}

function EditorContentWithKey(props) @{
	// Remount the host whenever the Editor identity changes, matching the keyed
	// wrapper in @tiptap/react and preventing one editor from retaining another
	// editor's managed DOM.
	const key = useMemo(() => Math.floor(Math.random() * 4294967295).toString(), [props.editor]);

	<PureEditorContent key={key} {...props} />
}

export const EditorContent = memo(EditorContentWithKey);
