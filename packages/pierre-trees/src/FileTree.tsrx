// Ported from @pierre/trees 1.0.0-beta.6
// (https://github.com/pierrecomputer/pierre/blob/a90629e0481bb8fed48f36ccb358d5d48a3ae8b6/packages/trees/src/react/FileTree.tsx),
// with upstream's src/react/jsx.d.ts folded in; Apache-2.0, see LICENSE.upstream
// and NOTICE.upstream.
//
// Octane adaptations: hooks and host types come from `octane`, the model,
// constants and payload types from the `@pierre/trees` root entry, and the
// `"use client"` directive is dropped. Octane runs no effects on the server, so
// upstream's `useClientLayoutEffect` switch is `useLayoutEffect`. The host
// renders the literal `file-tree-container` tag (upstream's
// `FILE_TREE_TAG_NAME`), which Octane's JSX types learn below. `style` stays
// upstream's object type: Octane hosts also accept a CSS string, which the
// merge below cannot spread. Every dependency array is upstream's.
import {
	CONTEXT_MENU_SLOT_NAME,
	type ContextMenuItem as FileTreeContextMenuItem,
	type ContextMenuOpenContext as FileTreeContextMenuOpenContext,
	type FileTree as FileTreeModel,
	type FileTreeCompositionOptions,
	type FileTreeSsrPayload,
	HEADER_SLOT_NAME,
} from '@pierre/trees';
import {
	type CSSProperties,
	type HTMLAttributes,
	type OctaneNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

declare module 'octane/jsx-runtime' {
	namespace Octane {
		namespace JSX {
			interface IntrinsicElements {
				'file-tree-container': Octane.DetailedHTMLProps<
					Octane.HTMLAttributes<HTMLElement>,
					HTMLElement
				>;
			}
		}
	}
}

interface ActiveContextMenuState {
	context: FileTreeContextMenuOpenContext;
	item: FileTreeContextMenuItem;
}

export type FileTreePreloadedData = Pick<FileTreeSsrPayload, 'id' | 'shadowHtml'>;

function renderFileTreeChildren(
	header: OctaneNode,
	renderContextMenu:
		| ((item: FileTreeContextMenuItem, context: FileTreeContextMenuOpenContext) => OctaneNode)
		| undefined,
	activeContextMenu: ActiveContextMenuState | null,
): OctaneNode {
	const headerChild = header != null ? <div slot={HEADER_SLOT_NAME}>{header}</div> : null;
	const contextMenuChild =
		renderContextMenu != null && activeContextMenu != null ? (
			<div slot={CONTEXT_MENU_SLOT_NAME}>
				{renderContextMenu(activeContextMenu.item, activeContextMenu.context)}
			</div>
		) : null;

	if (headerChild == null && contextMenuChild == null) {
		return null;
	}

	return (
		<>
			{headerChild}
			{contextMenuChild}
		</>
	);
}

function renderPreloadedShadowDom(
	children: OctaneNode,
	preloadedData: FileTreePreloadedData | undefined,
): OctaneNode {
	if (typeof window === 'undefined' && preloadedData != null) {
		return (
			<>
				{/* @ts-expect-error Octane's JSX types do not know the declarative shadow DOM attribute. */}
				<template
					shadowrootmode="open"
					dangerouslySetInnerHTML={{ __html: preloadedData.shadowHtml }}
				/>
				{children}
			</>
		);
	}

	return <>{children}</>;
}

function hasExistingPreloadedContent(host: HTMLElement): boolean {
	const shadowRoot = host.shadowRoot;
	if (
		shadowRoot?.querySelector('[data-file-tree-id]') instanceof HTMLElement ||
		shadowRoot?.querySelector('[data-file-tree-id]') instanceof SVGElement
	) {
		return true;
	}

	return host.querySelector('template[shadowrootmode="open"]') instanceof HTMLTemplateElement;
}

function resolveComposition(
	baselineComposition: FileTreeCompositionOptions | undefined,
	header: OctaneNode,
	hasContextMenu: boolean,
	onClose: () => void,
	onOpen: (item: FileTreeContextMenuItem, context: FileTreeContextMenuOpenContext) => void,
): FileTreeCompositionOptions | undefined {
	const nextComposition: FileTreeCompositionOptions = {
		...(baselineComposition ?? {}),
	};

	if (header != null) {
		delete nextComposition.header;
	}

	if (hasContextMenu) {
		const baselineContextMenu = baselineComposition?.contextMenu;
		const baselineOnClose = baselineContextMenu?.onClose;
		const baselineOnOpen = baselineContextMenu?.onOpen;

		nextComposition.contextMenu = {
			...(baselineContextMenu ?? {}),
			enabled: true,
			onClose: () => {
				baselineOnClose?.();
				onClose();
			},
			onOpen: (item, context) => {
				onOpen(item, context);
				baselineOnOpen?.(item, context);
			},
		};
		delete nextComposition.contextMenu.render;
	}

	return nextComposition.header != null || nextComposition.contextMenu != null
		? nextComposition
		: undefined;
}

export interface FileTreeProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'style'> {
	header?: OctaneNode;
	model: FileTreeModel;
	preloadedData?: FileTreePreloadedData;
	renderContextMenu?: (
		item: FileTreeContextMenuItem,
		context: FileTreeContextMenuOpenContext,
	) => OctaneNode;
	style?: CSSProperties;
}

export function FileTree({
	header,
	id,
	model,
	preloadedData,
	renderContextMenu,
	...hostProps
}: FileTreeProps) @{
	const [activeContextMenu, setActiveContextMenu] = useState<ActiveContextMenuState | null>(null);
	const [hostElement, setHostElement] = useState<HTMLElement | null>(null);
	const baselineCompositionRef = useRef<FileTreeCompositionOptions | undefined>(
		model.getComposition(),
	);
	const baselineModelRef = useRef(model);
	if (baselineModelRef.current !== model) {
		baselineModelRef.current = model;
		baselineCompositionRef.current = model.getComposition();
	}

	const hasContextMenu = renderContextMenu != null;
	const handleContextMenuClose = useCallback(() => {
		setActiveContextMenu(null);
	}, []);
	const handleContextMenuOpen = useCallback(
		(item: FileTreeContextMenuItem, context: FileTreeContextMenuOpenContext) => {
			setActiveContextMenu({ context, item });
		},
		[],
	);
	const baselineComposition = baselineCompositionRef.current;
	const composition = useMemo<FileTreeCompositionOptions | undefined>(
		() =>
			resolveComposition(
				baselineComposition,
				header,
				hasContextMenu,
				handleContextMenuClose,
				handleContextMenuOpen,
			),
		[baselineComposition, handleContextMenuClose, handleContextMenuOpen, hasContextMenu, header],
	);

	const handleHostRef = useCallback((node: HTMLElement | null) => {
		setHostElement(node);
	}, []);

	useEffect(() => {
		if (hasContextMenu) {
			return;
		}

		setActiveContextMenu(null);
	}, [hasContextMenu]);

	useLayoutEffect(() => {
		model.setComposition(composition);
	}, [composition, model]);

	useLayoutEffect(() => {
		if (hostElement == null) {
			return;
		}

		if (preloadedData != null && hasExistingPreloadedContent(hostElement)) {
			model.hydrate({ fileTreeContainer: hostElement });
		} else {
			model.render({ fileTreeContainer: hostElement });
		}

		return () => {
			model.unmount();
			model.setComposition(baselineComposition);
		};
	}, [baselineComposition, hostElement, model, preloadedData]);

	const children = renderPreloadedShadowDom(
		renderFileTreeChildren(header, renderContextMenu, activeContextMenu),
		preloadedData,
	);
	const resolvedHostId = id ?? preloadedData?.id;

	// Paint the model's resolved density onto the host so callers don't have to
	// set `--trees-item-height` and `--trees-density-override` themselves.
	// Caller-provided `style` keys still win via spread order.
	const mergedStyle: CSSProperties = {
		['--trees-item-height' as string]: `${String(model.getItemHeight())}px`,
		['--trees-density-override' as string]: model.getDensityFactor(),
		...hostProps.style,
	};

	<file-tree-container
		{...hostProps}
		id={resolvedHostId}
		ref={handleHostRef}
		style={mergedStyle}
		suppressHydrationWarning={preloadedData != null}
	>
		{children}
	</file-tree-container>
}
