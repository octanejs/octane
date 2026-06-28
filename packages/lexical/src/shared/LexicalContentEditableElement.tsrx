// Ported from @lexical/react/src/shared/LexicalContentEditableElement.tsx.
// React's `forwardRef` + `mergeRefs` becomes octane's ref-as-prop + a multi-ref
// array (`ref={[userRef, handleRef]}`). `handleRef` binds the editor to the DOM
// node via setRootElement — octane fires callback refs at commit with a connected
// node, the same timing React's ref gets, and calls them with null on unmount.
//
// The full ARIA set + `{...rest}` passthrough mirror @lexical/react exactly:
// boolean ARIA values are stringified (octane drops `false` as an attribute), and
// unknown props flow through via `rest` (everything not consumed by name).
import { useCallback, useLayoutEffect, useState } from 'octane';

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

export function ContentEditableElement(props) @{
	const editor = props.editor;
	const [isEditable, setEditable] = useState(editor.isEditable());

	const handleRef = useCallback((rootElement) => {
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
			rest[k] = props[k];
		}
	}
	// Route `class` through the spread (setSpread omits an absent/undefined key) so
	// an unset className produces NO attribute — matching React. An explicit
	// `class={undefined}` binding would emit `class=""` on the spread/de-opt path.
	if (props.className != null) {
		rest['class'] = props.className;
	}

	<div
		ref={props.ref != null ? [props.ref, handleRef] : handleRef}
		aria-activedescendant={isEditable ? props.ariaActiveDescendant : undefined}
		aria-autocomplete={isEditable ? props.ariaAutoComplete : 'none'}
		aria-controls={isEditable ? props.ariaControls : undefined}
		aria-describedby={props.ariaDescribedBy}
		aria-errormessage={props.ariaErrorMessage != null ? props.ariaErrorMessage : undefined}
		aria-expanded={isEditable && role === 'combobox' ? String(!!props.ariaExpanded) : undefined}
		aria-invalid={props.ariaInvalid != null ? props.ariaInvalid : undefined}
		aria-label={props.ariaLabel}
		aria-labelledby={props.ariaLabelledBy}
		aria-multiline={props.ariaMultiline}
		aria-owns={isEditable ? props.ariaOwns : undefined}
		aria-readonly={isEditable ? undefined : 'true'}
		aria-required={props.ariaRequired != null ? String(props.ariaRequired) : undefined}
		autocapitalize={props.autoCapitalize}
		contenteditable={isEditable ? 'true' : 'false'}
		data-testid={props['data-testid']}
		id={props.id}
		role={role}
		spellcheck={props.spellCheck === false ? 'false' : 'true'}
		style={props.style}
		tabindex={props.tabIndex}
		{...rest}
	/>
}
