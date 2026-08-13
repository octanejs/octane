import { ATTRIBUTE_ALIASES, BOOLEAN_ATTR_PROPS } from './constants.js';

const KNOWN_CAMELCASE_PROPERTIES = new Set([
	'autoFocus',
	'autoComplete',
	'autoPlay',
	'allowFullScreen',
	'charSet',
	'className',
	'contentEditable',
	'dangerouslySetInnerHTML',
	'defaultChecked',
	'defaultValue',
	'disablePictureInPicture',
	'disableRemotePlayback',
	'encType',
	'fetchPriority',
	'formAction',
	'formEncType',
	'formMethod',
	'formNoValidate',
	'formTarget',
	'imageSizes',
	'imageSrcSet',
	'itemID',
	'itemProp',
	'itemRef',
	'itemScope',
	'itemType',
	'noModule',
	'noValidate',
	'playsInline',
	'readOnly',
	'referrerPolicy',
	'spellCheck',
	'srcDoc',
	'srcLang',
	'srcSet',
	'suppressContentEditableWarning',
	'suppressHydrationWarning',
	'suppressNativeChangeWarning',
	'tabIndex',
	'viewBox',
]);

const KNOWN_PROPERTY_SPELLINGS = new Map<string, string>();
for (const name of KNOWN_CAMELCASE_PROPERTIES)
	KNOWN_PROPERTY_SPELLINGS.set(name.toLowerCase(), name);
for (const [name, alias] of ATTRIBUTE_ALIASES) {
	KNOWN_PROPERTY_SPELLINGS.set(name.toLowerCase(), name);
	KNOWN_PROPERTY_SPELLINGS.set(alias.toLowerCase(), name);
}

/** Development-only host-name/value diagnostics shared by DOM and SSR. */
export function hostPropertyWarning(name: string, value: unknown): string | null {
	const lower = name.toLowerCase();
	if (lower === 'innerhtml') {
		return (
			'Directly setting property `innerHTML` is not permitted. ' +
			'Use `dangerouslySetInnerHTML={{ __html: value }}` instead.'
		);
	}
	if (lower === 'is' && value != null && typeof value !== 'string') {
		return (
			`Received a \`${typeof value}\` for a string attribute \`is\`. ` +
			'If this is expected, cast the value to a string.'
		);
	}
	if (name.length > 2 && name[0] === 'o' && name[1] === 'n' && typeof value === 'string') {
		return `Unknown event handler property \`${name}\`. It will be ignored.`;
	}
	if (name.startsWith('aria-') || /^aria[A-Z]/.test(name) || name.startsWith('data-')) return null;
	const known = KNOWN_PROPERTY_SPELLINGS.get(lower);
	if (known !== undefined) {
		return name !== known ? `Invalid DOM property \`${name}\`. Did you mean \`${known}\`?` : null;
	}
	if (name !== lower && !name.includes(':')) {
		return (
			`Octane does not recognize the \`${name}\` prop on a DOM element. ` +
			'If you intentionally want it to appear in the DOM as a custom attribute, ' +
			`spell it as lowercase \`${lower}\` instead. ` +
			'If you accidentally passed it from a parent component, remove it from the DOM element.'
		);
	}
	return null;
}

/** React-style guidance for ambiguous string values on native boolean props. */
export function booleanAttributeStringWarning(name: string, value: unknown): string | null {
	if ((value !== 'false' && value !== 'true') || !BOOLEAN_ATTR_PROPS.has(name.toLowerCase())) {
		return null;
	}
	return (
		`Received the string \`${value}\` for the boolean attribute \`${name}\`. ` +
		(value === 'false'
			? 'The browser will interpret it as a truthy value. '
			: 'Although this works, it will not work as expected if you pass the string "false". ') +
		`Did you mean ${name}={${value}}?`
	);
}

/** Group function/symbol host values into one singular/plural diagnostic. */
export function invalidHostPropertiesWarning(names: readonly string[], tag: string): string {
	const quoted = names.map((name) => `\`${name}\``).join(', ');
	return names.length === 1
		? `Invalid value for prop ${quoted} on <${tag}> tag. ` +
				'Either remove it from the element, or pass a string or number value to keep it in the DOM.'
		: `Invalid values for props ${quoted} on <${tag}> tag. ` +
				'Either remove them from the element, or pass a string or number value to keep them in the DOM.';
}

/** Explain why empty image/object/stylesheet URLs cannot safely be emitted. */
export function emptyResourceUrlWarning(name: string): string {
	return (
		`An empty string was passed to the \`${name}\` attribute. ` +
		'This may cause the browser to download the whole page again. ' +
		'Pass null instead of an empty string.'
	);
}

/** Explain an attribute coercion failure without replacing its exception. */
export function unsupportedAttributeCoercionWarning(name: string, value: unknown): string {
	const type =
		typeof value === 'symbol'
			? 'Symbol'
			: (value as { constructor?: { name?: string } }).constructor?.name || typeof value;
	return (
		`The provided \`${name}\` attribute is an unsupported type ${type}. ` +
		'Coerce it to a string before passing it to a DOM element.'
	);
}
