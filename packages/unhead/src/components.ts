import type { ActiveHeadEntry, ResolvableHead as UseHeadInput } from 'unhead/types';
import type { ElementDescriptor, OctaneNode } from 'octane';
import {
	Children,
	Fragment,
	isValidElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from 'octane';
import { HasElementTags, TagsWithInnerContent, ValidHeadTags } from 'unhead/utils';
import { useUnhead } from './composables';
import { subSlot } from './internal';

/**
 * `<Head>` inspects `createElement` tag children and pushes them into Unhead.
 *
 * OCTANE DIVERGENCE: TSRX block children (`<Head><title>…</title></Head>`) are
 * opaque compiler children-blocks, not inspectable element descriptors. Pass
 * `children={createElement('title', null, 'Page')}` or an array of
 * `createElement` host tags (`title` / `meta` / `link` / `script` / `style` / …).
 */
export interface HeadProps {
	children?: OctaneNode;
	titleTemplate?: string;
}

function normalizeRawContent(tagName: string, data: Record<string, any>) {
	const rawContent = data.dangerouslySetInnerHTML;
	delete data.dangerouslySetInnerHTML;

	if (rawContent == null) return;

	if (!TagsWithInnerContent.has(tagName)) {
		throw new Error(
			`${tagName} is a self-closing tag and must neither have \`children\` nor use \`dangerouslySetInnerHTML\`.`,
		);
	}
	if (typeof rawContent !== 'object' || !('__html' in rawContent)) {
		throw new Error('`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`.');
	}
	if (data.children != null) {
		throw new Error('Can only set one of `children` or `props.dangerouslySetInnerHTML`.');
	}

	const content = rawContent.__html;
	if (content != null) data[tagName === 'title' ? 'textContent' : 'innerHTML'] = String(content);
}

function normalizeReactPropAliases(props: unknown): Record<string, any> {
	if (!props || typeof props !== 'object') return {};

	const normalized: Record<string, any> = {};
	for (const [prop, value] of Object.entries(props as Record<string, unknown>)) {
		if (
			prop === 'ref' ||
			prop === 'suppressContentEditableWarning' ||
			prop === 'suppressHydrationWarning'
		) {
			continue;
		}

		const name = prop === 'className' ? 'class' : prop === 'httpEquiv' ? 'http-equiv' : prop;
		normalized[name] = value;
	}
	return normalized;
}

function flattenHeadElements(children: OctaneNode): ElementDescriptor[] {
	const elements: ElementDescriptor[] = [];
	Children.forEach(children, function collect(child) {
		if (!isValidElement(child)) return;

		if (child.type === Fragment) {
			const nested = flattenHeadElements((child.props as { children?: OctaneNode }).children);
			for (let i = 0; i < nested.length; i++) {
				elements.push(nested[i]);
			}
			return;
		}

		elements.push(child);
	});
	return elements;
}

export function Head(props: HeadProps): null {
	const children = props.children;
	const titleTemplate = props.titleTemplate;
	const head = useUnhead(subSlot(undefined, 'head:unhead'));

	const processedElements = useMemo(
		function flatten() {
			return flattenHeadElements(children);
		},
		[children],
		subSlot(undefined, 'head:elements'),
	);

	const getHeadChanges = useCallback(
		function collectHeadChanges() {
			const input: UseHeadInput = {
				titleTemplate,
			};

			for (const element of processedElements) {
				const { type, props: elementProps } = element;
				const tagName = String(type);

				if (!ValidHeadTags.has(tagName)) {
					continue;
				}

				const data = normalizeReactPropAliases(elementProps);
				normalizeRawContent(tagName, data);

				if (TagsWithInnerContent.has(tagName) && data.children != null) {
					const contentKey = tagName === 'script' ? 'innerHTML' : 'textContent';
					data[contentKey] = Array.isArray(data.children)
						? data.children.map(String).join('')
						: String(data.children);
				}
				delete data.children;
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

			return input;
		},
		[processedElements, titleTemplate],
		subSlot(undefined, 'head:changes'),
	);

	const headRef = useRef<ActiveHeadEntry<any> | null>(null, subSlot(undefined, 'head:entry'));

	if (head.ssr && !headRef.current) {
		headRef.current = head.push(getHeadChanges());
	}

	useEffect(
		function mountHead() {
			headRef.current = head.push(getHeadChanges());
			return function disposeHead() {
				headRef.current?.dispose();
				headRef.current = null;
			};
		},
		[head],
		subSlot(undefined, 'head:mount'),
	);

	useEffect(
		function patchHead() {
			headRef.current?.patch(getHeadChanges());
		},
		[getHeadChanges],
		subSlot(undefined, 'head:patch'),
	);

	return null;
}
