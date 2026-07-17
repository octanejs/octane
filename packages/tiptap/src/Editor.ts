import type { Editor } from '@tiptap/core';
import type { PortalDescriptor } from 'octane';

import type { ReactRenderer } from './ReactRenderer';

/** One immutable renderer entry consumed by EditorContent's keyed portal list. */
export type RendererPortalEntry = {
	id: string;
	portal: PortalDescriptor;
};

export type RendererPortalSnapshot = Readonly<Record<string, RendererPortalEntry>>;

/** External-store registry shared by EditorContent and custom view renderers. */
export type ContentComponent = {
	setRenderer(id: string, renderer: ReactRenderer<any, any>): void;
	removeRenderer(id: string): void;
	subscribe(callback: () => void): () => void;
	getSnapshot(): RendererPortalSnapshot;
	getServerSnapshot(): RendererPortalSnapshot;
};

/** TipTap's Editor augmented with the framework binding's mounted content state. */
export type EditorWithContentComponent = Editor & {
	contentComponent?: ContentComponent | null;
	isEditorContentInitialized?: boolean;
};
