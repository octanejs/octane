import { createElement, Fragment, type OctaneNode } from 'octane';
import { formatElements } from './format';
import type { I18n, MessageId, MessageOptions } from '@lingui/core';

export type TransRenderProps = {
	id: MessageId;
	translation: OctaneNode;
	children: OctaneNode;
	message?: string | null;
};

export type TransRenderCallbackOrComponent =
	| {
			component?: never;
			render?: ((props: TransRenderProps) => OctaneNode) | null;
	  }
	| {
			component?: ((props: TransRenderProps) => OctaneNode) | null;
			render?: never;
	  };

export type TransProps =
	{
		id: MessageId;
		message?: string;
		values?: Record<string, unknown>;
		components?: { [key: string]: OctaneNode };
		formats?: MessageOptions['formats'];
		comment?: string;
	} & TransRenderCallbackOrComponent;

/**
 * Version of `<Trans>` component without using a Provider/Context React feature.
 * Primarily made for support React Server Components (RSC)
 *
 * @experimental the api of this component is not stabilized yet.
 */
export function TransNoContext(props: TransProps & {
	lingui: {
		i18n: I18n;
		defaultComponent?: (props: TransRenderProps) => OctaneNode;
	};
}): OctaneNode {
	const render = props.render;
	const component = props.component;
	const id = props.id;
	const message = props.message;
	const formats = props.formats;
	const i18n = props.lingui.i18n;
	const defaultComponent = props.lingui.defaultComponent;

	const interpolated = getInterpolationValuesAndComponents(props);
	const values = interpolated.values;
	const components = interpolated.components;

	const translated: string =
		i18n && typeof i18n._ === 'function' ? i18n._(id, values, { message, formats }) : id;

	const translation =
		translated ? formatElements(translated, components) : null;

	if (render === null || component === null) {
		return translation;
	}

	const FallbackComponent = defaultComponent || RenderChildren;

	const i18nProps: TransRenderProps = {
		id,
		message,
		translation,
		children: translation,
	};

	if (render && component) {
		console.error(
			'You can\'t use both `component` and `render` prop at the same time. `component` is ignored.',
		);
	} else if (render && typeof render !== 'function') {
		console.error(
			`Invalid value supplied to prop \`render\`. It must be a function, provided ${render}`,
		);
	} else if (component && typeof component !== 'function') {
		console.error(
			`Invalid value supplied to prop \`component\`. It must be a React component, provided ${component}`,
		);

		return <FallbackComponent {...i18nProps}>{translation}</FallbackComponent>;
	}

	if (typeof render === 'function') {
		return render(i18nProps);
	}

	const Component = component || FallbackComponent;

	return <Component {...i18nProps}>{translation}</Component>;
}

function RenderChildren(props: TransRenderProps) {
	return props.children;
}

function getInterpolationValuesAndComponents(props: TransProps) {
	if (!props.values) {
		return {
			values: undefined,
			components: props.components,
		};
	}

	const values = { ...props.values };
	const components = { ...props.components };
	/*
      Replace values placeholders with <INDEX /> and add values to `components`.
      This makes them processed as JSX children and follow JSX semantics.

      Related discussion: https://github.com/lingui/js-lingui/issues/1904

      Another use-case is when React components are directly passed as values:

      Example:
      Translation: 'Hello {name}'
      Values: { name: <strong>Jane</strong> }

      It'll become "Hello <0 />" with components=[<strong>Jane</strong>]

      Related discussion: https://github.com/lingui/js-lingui/issues/183
    */
	const entries = Object.entries(props.values);
	for (let i = 0; i < entries.length; i++) {
		const key = entries[i]![0];
		const valueForKey = entries[i]![1];
		if (typeof valueForKey === 'string' || typeof valueForKey === 'number') {
			continue;
		}
		const index = Object.keys(components).length;
		components[index] = createElement(Fragment, null, valueForKey);
		values[key] = `<${index}/>`;
	}
	return { values, components };
}
