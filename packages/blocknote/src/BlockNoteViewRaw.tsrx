// Independently authored Octane adapter for the public @blocknote/react 0.53.0 API.
import '@blocknote/core/style.css';

import type {
	BlockNoteEditor,
	BlockSchema,
	DefaultBlockSchema,
	DefaultInlineContentSchema,
	DefaultStyleSchema,
	InlineContentSchema,
	StyleSchema,
} from '@blocknote/core';
import {
	createContext,
	type OctaneNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'octane';
import type { Octane } from 'octane/jsx-runtime';

import {
	BlockNoteContext,
	type BlockNoteContextValue,
	useBlockNoteContext,
} from './BlockNoteContext';
import { useEditorChange } from './hooks/useEditorChange';
import { useEditorSelectionChange } from './hooks/useEditorSelectionChange';
import { usePrefersColorScheme } from './hooks/usePrefersColorScheme';
import { type PortalElementsMap, resolvePortalTarget } from './portalTarget';

export type BlockNoteViewProps<
	B extends BlockSchema = DefaultBlockSchema,
	I extends InlineContentSchema = DefaultInlineContentSchema,
	S extends StyleSchema = DefaultStyleSchema,
> =
	{
		editor: BlockNoteEditor<B, I, S>;
		theme?: 'light' | 'dark';
		/** @default true */
		editable?: boolean;
		onChange?: Parameters<BlockNoteEditor<B, I, S>['onChange']>[0];
		onSelectionChange?: () => void;
		/**
 * Render the editable surface as the container's first child. Set to
 * `false` to place `BlockNoteViewEditor` among `children` yourself.
 * @default true
 */
		renderEditor?: boolean;
		autoFocus?: boolean;
		portalElements?: PortalElementsMap;
		className?: string;
		children?: OctaneNode;
		ref?: React.Ref<HTMLDivElement>;
	} & Omit<
		Octane.HTMLAttributes<HTMLDivElement>,
		'onChange' | 'onSelectionChange' | 'children' | 'class' | 'className'
	>;

/** What `BlockNoteViewRaw` hands to the `BlockNoteViewEditor` it contains. */
type ViewEditorSettings = {
	autoFocus: boolean | undefined;
	editable: boolean | undefined;
	portalTarget: HTMLElement | null;
	contentEditableProps: Record<string, any> | undefined;
};

const ViewEditorContext = createContext<ViewEditorSettings | undefined>(undefined);

const ignore = () => {};

export function BlockNoteViewRaw<
	B extends BlockSchema = DefaultBlockSchema,
	I extends InlineContentSchema = DefaultInlineContentSchema,
	S extends StyleSchema = DefaultStyleSchema,
>(props: BlockNoteViewProps<B, I, S>) @{
	const {
		editor,
		theme,
		editable,
		onChange,
		onSelectionChange,
		renderEditor,
		autoFocus,
		portalElements,
		className,
		children,
		ref,
		...rest
	} = props;

	const outerContext = useBlockNoteContext();
	const systemColorScheme = usePrefersColorScheme();
	const scheme: 'light' | 'dark' =
		theme ?? outerContext?.colorSchemePreference ??
			(systemColorScheme === 'dark' ? 'dark' : 'light');

	const [contentEditableProps, setContentEditableProps] = useState<Record<string, any> | undefined>(
		undefined,
	);

	useEditorChange((onChange ?? ignore) as Parameters<typeof useEditorChange>[0], editor);
	useEditorSelectionChange(onSelectionChange ?? ignore, editor);

	useEffect(() => {
		const portalElement = editor.portalElement;
		if (!portalElement) {
			throw new Error('Portal element not found');
		}

		portalElement.className = className ? `bn-root ${scheme} ${className}` : `bn-root ${scheme}`;
		portalElement.setAttribute('data-color-scheme', scheme);
	}, [editor, scheme, className]);

	const portalTargetOption = portalElements?.default;
	const portalTarget = useMemo(() => resolvePortalTarget(portalTargetOption), [portalTargetOption]);

	const contextValue = useMemo<BlockNoteContextValue<B, I, S>>(
		() => ({
			...outerContext,
			editor,
			colorSchemePreference: scheme,
			setContentEditableProps,
		}),
		[outerContext, editor, scheme, setContentEditableProps],
	);

	const settings = useMemo<ViewEditorSettings>(
		() => ({ autoFocus, editable, portalTarget, contentEditableProps }),
		[autoFocus, editable, portalTarget, contentEditableProps],
	);

	<BlockNoteContext value={contextValue}>
		<ViewEditorContext value={settings}>
			<div
				{...rest}
				class={['bn-root bn-container', scheme, className]}
				data-color-scheme={scheme}
				ref={ref ?? null}
			>
				@if (renderEditor !== false) {
					<BlockNoteViewEditor>{children}</BlockNoteViewEditor>
				} @else {
					<>
						{children}
					</>
				}
			</div>
		</ViewEditorContext>
	</BlockNoteContext>
}

/** The editable surface. Renders only inside a `BlockNoteViewRaw`. */
export function BlockNoteViewEditor(props: { children?: OctaneNode }) @{
	const settings = useContext(ViewEditorContext);
	const editor = useBlockNoteContext()?.editor;

	if (!settings || !editor) {
		throw new Error('BlockNoteViewEditor must be rendered inside a BlockNoteViewRaw component');
	}

	const { autoFocus, editable, portalTarget, contentEditableProps } = settings;

	// A new callback identity detaches the old ref (unmount) and attaches the new
	// one (mount). Remounting on `editable` changes is deliberate: TipTap drops the
	// host's tabIndex when editability flips on a mounted view.
	const mountEditor = useCallback((element: HTMLDivElement | null) => {
		editor.isEditable = editable !== false;
		if (element) {
			editor.mount(element, { portalTarget });
		} else {
			editor.unmount();
		}
	}, [editable, editor, portalTarget]);

	<>
		<div
			aria-autocomplete="list"
			aria-haspopup="listbox"
			data-bn-autofocus={autoFocus}
			{...contentEditableProps}
			ref={mountEditor}
		/>
		{props.children}
	</>
}
