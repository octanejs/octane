import { createNormalizer } from '@zag-js/types';
import type { JSX } from 'octane/jsx-runtime';

export type PropTypes = JSX.IntrinsicElements & {
	element: JSX.IntrinsicElements['div'];
	style: Exclude<JSX.IntrinsicElements['div']['style'], string | undefined>;
};

// Match Octane's text-entry contract (native-change-diagnostics): only these
// input types treat React-style onChange as per-edit onInput. Everything in
// NON_TEXT_INPUT_TYPES keeps native onChange; unknown types follow HTML's
// invalid-value default and are treated as text.
const TEXT_ENTRY_TYPES = new Set(['email', 'number', 'password', 'search', 'tel', 'text', 'url']);
const NON_TEXT_INPUT_TYPES = new Set([
	'button',
	'checkbox',
	'color',
	'date',
	'datetime-local',
	'file',
	'hidden',
	'image',
	'month',
	'radio',
	'range',
	'reset',
	'submit',
	'time',
	'week',
]);

function isTextHostElement(elementKey: string, props: Record<string, unknown>): boolean {
	if (elementKey === 'textarea') return true;
	if (elementKey !== 'input') return false;
	const type = typeof props.type === 'string' ? props.type.toLowerCase() : 'text';
	if (TEXT_ENTRY_TYPES.has(type)) return true;
	if (NON_TEXT_INPUT_TYPES.has(type)) return false;
	return true;
}

function rewriteTextHostOnChange(
	elementKey: string,
	value: Record<string, unknown>,
): Record<string, unknown> {
	if (!isTextHostElement(elementKey, value)) return value;
	if (typeof value.onChange !== 'function' || value.onInput !== undefined) return value;
	const { onChange, ...rest } = value;
	return { ...rest, onInput: onChange };
}

type ZagNormalizeProps = ReturnType<typeof createNormalizer<PropTypes>>;

function createOctaneNormalizer(): ZagNormalizeProps {
	return new Proxy({} as ZagNormalizeProps, {
		get(_target, key) {
			if (key === 'style') {
				return function styleProps(props: PropTypes['style']) {
					return props;
				};
			}
			return function normalizeElementProps(value: Record<string, unknown>) {
				return rewriteTextHostOnChange(String(key), value);
			};
		},
	});
}

export const normalizeProps = createOctaneNormalizer();
