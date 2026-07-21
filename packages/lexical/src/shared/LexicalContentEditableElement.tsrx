// Ported from @lexical/react/src/shared/LexicalContentEditableElement.tsx.
// React's `forwardRef` + `mergeRefs` becomes octane's ref-as-prop + a multi-ref
// array (`ref={[userRef, handleRef]}`). `handleRef` binds the editor to the DOM
// node via setRootElement — octane fires callback refs at commit with a connected
// node, the same timing React's ref gets, and calls them with null on unmount.
//
// The full ARIA set + `{...rest}` passthrough mirror @lexical/react exactly:
// boolean ARIA values are stringified (octane drops `false` as an attribute), and
// unknown props flow through via `rest` (everything not consumed by name).
import type { LexicalEditor } from 'lexical';
import { useCallback, useLayoutEffect, useState } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

type DivAttributes = Octane.HTMLAttributes<HTMLDivElement>;

/**
 * Props for the {@link ContentEditableElement} component. In addition to an
 * `editor`, it accepts the standard `<div>` attributes (except `placeholder`),
 * including the hyphenated `aria-*` attributes, which are the preferred way to
 * set ARIA properties. The camelCase `aria*` props (such as `ariaLabel`) are
 * also accepted but are retained only for backwards compatibility.
 */
export type ContentEditableElementProps =
	{
		editor: LexicalEditor;
		ariaActiveDescendant?: DivAttributes['aria-activedescendant'];
		ariaAutoComplete?: DivAttributes['aria-autocomplete'];
		ariaControls?: DivAttributes['aria-controls'];
		ariaDescribedBy?: DivAttributes['aria-describedby'];
		ariaErrorMessage?: DivAttributes['aria-errormessage'];
		ariaExpanded?: DivAttributes['aria-expanded'];
		ariaInvalid?: DivAttributes['aria-invalid'];
		ariaLabel?: DivAttributes['aria-label'];
		ariaLabelledBy?: DivAttributes['aria-labelledby'];
		ariaMultiline?: DivAttributes['aria-multiline'];
		ariaOwns?: DivAttributes['aria-owns'];
		ariaRequired?: DivAttributes['aria-required'];
		autoCapitalize?: HTMLDivElement['autocapitalize'];
		'data-testid'?: string | null | undefined;
		// Octane ref shapes (no forwardRef): callback or ref object.
		ref?: ((el: HTMLDivElement | null) => void) | { current: HTMLDivElement | null };
		// Consumed (excluded from the `rest` passthrough) but never rendered —
		// upstream omits `placeholder` from the accepted div attributes; the octane
		// port receives it via `<ContentEditable {...props}>`'s spread instead.
		placeholder?: unknown;
	} & Omit<Octane.JSX.IntrinsicElements['div'], 'ref' | 'placeholder'>;

// Props consumed by name — everything else flows through to the <div> via `rest`.
const NAMED_PROPS = new Set([
	'editor',
	'ariaActiveDescendant',
	'ariaAutoComplete',
	'ariaControls',
	'ariaDescribedBy',
	'ariaErrorMessage',
	'ariaExpanded',
	'ariaInvalid',
	'ariaLabel',
	'ariaLabelledBy',
	'ariaMultiline',
	'ariaOwns',
	'ariaRequired',
	'autoCapitalize',
	'className',
	'contentEditable',
	'id',
	'role',
	'spellCheck',
	'style',
	'tabIndex',
	'ref',
	'placeholder',
	'data-testid',
]);

export function ContentEditableElement(props: ContentEditableElementProps) @{
	const editor = props.editor;
	const [isEditable, setEditable] = useState(editor.isEditable());

	const handleRef = useCallback((rootElement: HTMLDivElement | null) => {
		// defaultView is required for a root element. In multi-window setups it may
		// not exist at certain points.
		if (rootElement && rootElement.ownerDocument && rootElement.ownerDocument.defaultView) {
			editor.setRootElement(rootElement);
		} else {
			editor.setRootElement(null);
		}
	}, [editor]);

	useLayoutEffect(() => {
		setEditable(editor.isEditable());
		return editor.registerEditableListener((currentIsEditable) => {
			setEditable(currentIsEditable);
		});
	}, [editor]);

	const role =
		props.role != null ? props.role : 'textbox';
	const rest: Record<string, any> = {};
	for (const k in props) {
		if (!NAMED_PROPS.has(k)) {
			rest[k] = (props as Record<string, unknown>)[k];
		}
	}
	// Route `class` through the spread (setSpread omits an absent/undefined key) so
	// an unset className produces NO attribute — matching React. An explicit
	// `class={undefined}` binding would emit `class=""` on the spread/de-opt path.
	if (props.className != null) {
		rest['class'] = props.className;
	}

	// Attribute names are authored camelCase (matching upstream and octane's typed
	// JSX contract); the runtime writes the equivalent lowercase DOM attributes
	// (`tabIndex` via ATTRIBUTE_ALIASES, the rest via HTML's case-insensitive
	// setAttribute).
	<div
		ref={props.ref != null
			? // Octane's runtime accepts an array of refs natively; the checker's
				// merged-ref signature only models the single-ref forms, so the
				// dynamic array branch needs a type-level cast.
				[props.ref, handleRef] as unknown as typeof handleRef
			: handleRef}
		aria-activedescendant={isEditable ? props.ariaActiveDescendant : undefined}
		aria-autocomplete={isEditable ? props.ariaAutoComplete : 'none'}
		aria-controls={isEditable ? props.ariaControls : undefined}
		aria-describedby={props.ariaDescribedBy}
		aria-errormessage={props.ariaErrorMessage != null ? props.ariaErrorMessage : undefined}
		aria-expanded={isEditable && role === 'combobox'
			? String(!!props.ariaExpanded) as 'true' | 'false'
			: undefined}
		aria-invalid={props.ariaInvalid != null ? props.ariaInvalid : undefined}
		aria-label={props.ariaLabel}
		aria-labelledby={props.ariaLabelledBy}
		aria-multiline={props.ariaMultiline}
		aria-owns={isEditable ? props.ariaOwns : undefined}
		aria-readonly={isEditable ? undefined : 'true'}
		aria-required={props.ariaRequired != null
			? String(props.ariaRequired) as 'true' | 'false'
			: undefined}
		autoCapitalize={props.autoCapitalize}
		contentEditable={isEditable ? 'true' : 'false'}
		data-testid={props['data-testid']}
		id={props.id}
		role={role}
		spellCheck={props.spellCheck === false ? 'false' : 'true'}
		style={props.style}
		tabIndex={props.tabIndex}
		{...rest}
	/>
}
