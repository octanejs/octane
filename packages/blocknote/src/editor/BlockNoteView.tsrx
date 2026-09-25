import type {
	BlockNoteEditor,
	BlockSchema,
	DefaultBlockSchema,
	DefaultInlineContentSchema,
	DefaultStyleSchema,
	InlineContentSchema,
	StyleSchema,
} from '@blocknote/core';
import { type OctaneNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'octane';

import { BlockNoteContext, type BlockNoteContextValue } from './BlockNoteContext';
import { useBlockNoteEditor } from '../hooks/useBlockNoteEditor';

type DivProps = import('octane/jsx-runtime').Octane.JSX.IntrinsicElements['div'];
type ColorScheme = 'light' | 'dark';

export type BlockNoteViewProps<
	BSchema extends BlockSchema = DefaultBlockSchema,
	ISchema extends InlineContentSchema = DefaultInlineContentSchema,
	SSchema extends StyleSchema = DefaultStyleSchema,
> =
	Omit<DivProps, 'children' | 'onChange' | 'onSelectionChange'> & {
		editor: BlockNoteEditor<BSchema, ISchema, SSchema>;
		theme?: ColorScheme;
		editable?: boolean;
		onChange?: Parameters<BlockNoteEditor<BSchema, ISchema, SSchema>['onChange']>[0];
		onSelectionChange?: Parameters<
			BlockNoteEditor<BSchema, ISchema, SSchema>['onSelectionChange']
		>[0];
		renderEditor?: boolean;
		children?: OctaneNode;
	};

export type BlockNoteViewEditorProps = {
	children?: OctaneNode;
};

const useIsomorphicLayoutEffect =
	typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readPreferredColorScheme(): ColorScheme {
	return typeof window !== 'undefined' &&
	window.matchMedia?.('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light';
}

function useColorScheme(theme: ColorScheme | undefined): ColorScheme {
	const [preferred, setPreferred] = useState<ColorScheme>(readPreferredColorScheme);

	useEffect(() => {
		if (theme || typeof window === 'undefined' || !window.matchMedia) {
			return;
		}

		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const update = () => setPreferred(media.matches ? 'dark' : 'light');
		update();
		media.addEventListener('change', update);

		return () => media.removeEventListener('change', update);
	}, [theme]);

	return theme ?? preferred;
}

/** Mount the editor from the nearest BlockNote context. */
export function BlockNoteViewEditor({ children }: BlockNoteViewEditorProps) {
	const editor = useBlockNoteEditor();
	const mountRef = useRef<HTMLDivElement | null>(null);

	useIsomorphicLayoutEffect(() => {
		const element = mountRef.current;
		if (!element) {
			return;
		}

		editor.mount(element);
		return () => editor.unmount();
	}, [editor]);

	return <>
		<div data-blocknote-editor="" ref={mountRef} />
		{children}
	</>;
}

/**
 * Render a BlockNote core editor in Octane without copying the React binding.
 * Floating toolbars and other UI remain application-owned children.
 */
export function BlockNoteView<
	BSchema extends BlockSchema = DefaultBlockSchema,
	ISchema extends InlineContentSchema = DefaultInlineContentSchema,
	SSchema extends StyleSchema = DefaultStyleSchema,
>(props: BlockNoteViewProps<BSchema, ISchema, SSchema>) {
	const {
		children,
		class: classValue,
		className,
		editable = true,
		editor,
		onChange,
		onSelectionChange,
		renderEditor = true,
		theme,
		...containerProps
	} = props;
	const colorScheme = useColorScheme(theme);
	const contextValue = useMemo<BlockNoteContextValue<BSchema, ISchema, SSchema>>(
		() => ({ editor, colorSchemePreference: colorScheme }),
		[editor, colorScheme],
	);
	// Context identity is schema-agnostic at runtime. Erase the generic only at
	// the provider boundary; useBlockNoteContext restores it from the schema.
	const providerValue = contextValue as unknown as BlockNoteContextValue;

	useIsomorphicLayoutEffect(() => {
		editor.isEditable = editable;
	}, [editor, editable]);

	useEffect(() => {
		if (!onChange) {
			return;
		}

		return editor.onChange(onChange);
	}, [editor, onChange]);

	useEffect(() => {
		if (!onSelectionChange) {
			return;
		}

		return editor.onSelectionChange(onSelectionChange);
	}, [editor, onSelectionChange]);

	return <BlockNoteContext value={providerValue}>
		<div
			{...containerProps}
			class={['bn-container', 'bn-root', colorScheme, classValue, className]}
			data-color-scheme={colorScheme}
		>
			{renderEditor ? <BlockNoteViewEditor /> : null}
			{children}
		</div>
	</BlockNoteContext>;
}
