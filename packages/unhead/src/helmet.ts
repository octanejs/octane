import type { ActiveHeadEntry, Unhead, ResolvableHead as UseHeadInput } from 'unhead/types';
import type { OctaneNode } from 'octane';
import {
	Children,
	isValidElement,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from 'octane';
import {
	createHead as createClientHead,
	createDebouncedFn,
	createDomRenderer,
} from 'unhead/client';
import { HasElementTags, TagsWithInnerContent, ValidHeadTags } from 'unhead/utils';
import { UnheadContext } from './context';
import { subSlot } from './internal';

let singletonHead: Unhead | null = null;

function useHelmetHead(): Unhead {
	const ctx = useContext(UnheadContext);
	if (ctx) {
		return ctx;
	}
	if (!singletonHead) {
		if (typeof window === 'undefined') {
			throw new TypeError(
				'Helmet requires UnheadProvider on the server. Wrap your app with <UnheadProvider>.',
			);
		}
		const domRenderer = createDomRenderer();
		let head: ReturnType<typeof createClientHead<UseHeadInput>>;
		const debouncedRenderer = createDebouncedFn(
			function render() {
				return domRenderer(head);
			},
			function schedule(fn) {
				return setTimeout(fn, 0);
			},
		);
		head = createClientHead<UseHeadInput>({ render: debouncedRenderer });
		singletonHead = head;
	}
	return singletonHead;
}

export interface HelmetProps {
	children?: OctaneNode;
	/**
	 * A default title to use unchanged when no title is provided.
	 *
	 * Equivalent to react-helmet's `defaultTitle`.
	 */
	defaultTitle?: string;
	/**
	 * A template for the title. Use `%s` as a placeholder for the page title.
	 * The template is not applied to `defaultTitle`.
	 *
	 * @example `%s | My Site`
	 */
	titleTemplate?: string;
	/**
	 * Called after the document head has been updated in the browser.
	 *
	 * Equivalent to react-helmet's `onChangeClientState`.
	 *
	 * @param newState - The new head state after rendering.
	 * @param addedTags - Always empty — unhead manages DOM diffing internally.
	 * @param removedTags - Always empty — unhead manages DOM diffing internally.
	 */
	onChangeClientState?: (
		newState: Record<string, any>,
		addedTags: Record<string, HTMLElement[]>,
		removedTags: Record<string, HTMLElement[]>,
	) => void;
	/**
	 * Whether to encode special characters in attributes.
	 *
	 * @default true
	 * @deprecated Unhead handles encoding automatically. This prop is accepted for compatibility but has no effect.
	 */
	encodeSpecialCharacters?: boolean;
	/**
	 * Whether to defer DOM updates until the browser is idle.
	 *
	 * @default true
	 * @deprecated Unhead batches DOM updates automatically. This prop is accepted for compatibility but has no effect.
	 */
	defer?: boolean;
	title?: string;
	base?: Record<string, any>;
	meta?: Array<Record<string, any>>;
	link?: Array<Record<string, any>>;
	script?: Array<Record<string, any>>;
	style?: Array<Record<string, any>>;
	noscript?: Array<Record<string, any>>;
	htmlAttributes?: Record<string, any>;
	bodyAttributes?: Record<string, any>;
}

/**
 * A react-helmet compatible component powered by unhead.
 *
 * Drop-in replacement for `<Helmet>` — import from `@octanejs/unhead/helmet`.
 *
 * OCTANE DIVERGENCE: TSRX block children are opaque. Pass
 * `children={createElement('title', null, 'Page')}` or an array of
 * `createElement` host tags.
 */
export function Helmet(props: HelmetProps): null {
	const children = props.children;
	const defaultTitle = props.defaultTitle;
	const titleTemplate = props.titleTemplate;
	const onChangeClientState = props.onChangeClientState;
	const titleProp = props.title;
	const baseProp = props.base;
	const metaProp = props.meta;
	const linkProp = props.link;
	const scriptProp = props.script;
	const styleProp = props.style;
	const noscriptProp = props.noscript;
	const htmlAttributes = props.htmlAttributes;
	const bodyAttributes = props.bodyAttributes;
	const head = useHelmetHead();

	const processedElements = useMemo(
		function listElements() {
			return Children.toArray(children).filter(isValidElement);
		},
		[children],
		subSlot(undefined, 'helmet:elements'),
	);

	const getHeadChanges = useCallback(
		function collectHeadChanges() {
			const input: UseHeadInput = {};

			if (titleTemplate) {
				input.titleTemplate = defaultTitle
					? function resolveTitle(title: string | null | undefined) {
							return title ? titleTemplate.replace(/%s/g, title) : defaultTitle;
						}
					: titleTemplate;
			}

			if (titleProp != null) {
				input.title = titleProp;
			}
			if (baseProp) {
				input.base = baseProp as UseHeadInput['base'];
			}
			if (metaProp) {
				input.meta = [...metaProp] as UseHeadInput['meta'];
			}
			if (linkProp) {
				input.link = [...linkProp] as UseHeadInput['link'];
			}
			if (scriptProp) {
				input.script = [...scriptProp] as UseHeadInput['script'];
			}
			if (styleProp) {
				input.style = [...styleProp] as UseHeadInput['style'];
			}
			if (noscriptProp) {
				input.noscript = [...noscriptProp] as UseHeadInput['noscript'];
			}
			if (htmlAttributes) {
				input.htmlAttrs = htmlAttributes as UseHeadInput['htmlAttrs'];
			}
			if (bodyAttributes) {
				input.bodyAttrs = bodyAttributes as UseHeadInput['bodyAttrs'];
			}

			let hasTitle = !!titleProp;
			for (let i = 0; i < processedElements.length; i++) {
				const element = processedElements[i];
				const elementProps = element.props;
				let tagName = String(element.type);

				if (tagName === 'html') tagName = 'htmlAttrs';
				else if (tagName === 'body') tagName = 'bodyAttrs';

				if (!ValidHeadTags.has(tagName)) {
					continue;
				}

				const data: Record<string, any> = {
					...(typeof elementProps === 'object' && elementProps !== null ? elementProps : {}),
				};

				if (TagsWithInnerContent.has(tagName) && data.children != null) {
					const contentKey = tagName === 'script' ? 'innerHTML' : 'textContent';
					data[contentKey] = Array.isArray(data.children)
						? data.children.map(String).join('')
						: String(data.children);
				}
				delete data.children;

				if (tagName === 'title') {
					hasTitle = true;
				}

				if (HasElementTags.has(tagName)) {
					const key = tagName as keyof UseHeadInput;
					if (!Array.isArray(input[key])) {
						(input as Record<string, unknown>)[tagName] = [];
					}
					(input[key] as unknown[]).push(data);
				} else {
					(input as Record<string, unknown>)[tagName] = data;
				}
			}

			if (!hasTitle && defaultTitle && !titleTemplate) {
				input.title = {
					textContent: defaultTitle,
					tagPriority: 'low',
				};
			}

			return input;
		},
		[
			processedElements,
			titleTemplate,
			defaultTitle,
			titleProp,
			baseProp,
			metaProp,
			linkProp,
			scriptProp,
			styleProp,
			noscriptProp,
			htmlAttributes,
			bodyAttributes,
		],
		subSlot(undefined, 'helmet:changes'),
	);

	const headRef = useRef<ActiveHeadEntry<any> | null>(null, subSlot(undefined, 'helmet:entry'));

	const onChangeClientStateRef = useRef(
		onChangeClientState,
		subSlot(undefined, 'helmet:on-change'),
	);
	onChangeClientStateRef.current = onChangeClientState;

	if (head.ssr && !headRef.current) {
		headRef.current = head.push(getHeadChanges());
	}

	useEffect(
		function mountHelmet() {
			const options = {
				onRendered: function notify() {
					const cb = onChangeClientStateRef.current;
					if (!cb) return;
					const titleEl = document.querySelector('title');
					const state: Record<string, any> = {
						title: titleEl?.textContent || '',
					};
					const tags = ['meta', 'link', 'script', 'style', 'base'] as const;
					for (let i = 0; i < tags.length; i++) {
						const tag = tags[i];
						state[`${tag}Tags`] = Array.from(document.querySelectorAll(`head ${tag}`));
					}
					cb(state, {}, {});
				},
			};
			headRef.current = head.push(getHeadChanges(), options);
			return function disposeHelmet() {
				headRef.current?.dispose();
				headRef.current = null;
			};
		},
		[head],
		subSlot(undefined, 'helmet:mount'),
	);

	useEffect(
		function patchHelmet() {
			headRef.current?.patch(getHeadChanges());
		},
		[getHeadChanges],
		subSlot(undefined, 'helmet:patch'),
	);

	return null;
}
