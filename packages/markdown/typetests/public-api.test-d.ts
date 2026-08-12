import type { ElementDescriptor, OctaneNode } from 'octane';
import Markdown, {
	MarkdownAsync,
	MarkdownHooks,
	defaultUrlTransform,
	type AllowElement,
	type Components,
	type ExtraProps,
	type HooksOptions,
	type Options,
	type UrlTransform,
} from '../src/index';

declare function expectType<T>(value: T): void;

expectType<typeof Markdown>(Markdown);
expectType<typeof MarkdownAsync>(MarkdownAsync);
expectType<typeof MarkdownHooks>(MarkdownHooks);
expectType<typeof defaultUrlTransform>(defaultUrlTransform);

type OptionsChildren = Options['children'];
expectType<string | null | undefined>(null as unknown as OptionsChildren);

type HooksFallback = HooksOptions['fallback'];
expectType<OctaneNode | null | undefined>(null as unknown as HooksFallback);

type MarkdownResult = ReturnType<typeof Markdown>;
expectType<ElementDescriptor>(null as unknown as MarkdownResult);

type AsyncResult = ReturnType<typeof MarkdownAsync>;
expectType<Promise<ElementDescriptor>>(null as unknown as AsyncResult);

type HooksResult = ReturnType<typeof MarkdownHooks>;
expectType<OctaneNode>(null as unknown as HooksResult);

const allow: AllowElement = (element, index, parent) =>
	element.tagName === 'p' && index >= 0 && parent?.type === 'root';
const transform: UrlTransform = (url, key, node) =>
	key === 'href' && node.tagName === 'a' ? url : undefined;
const components = { p: 'section' } satisfies Components;
const options = {
	children: '# typed',
	components,
	allowElement: allow,
	urlTransform: transform,
} satisfies Options;
const rendered: ElementDescriptor = Markdown(options);
const asyncRendered: Promise<ElementDescriptor> = MarkdownAsync(options);
const hooksRendered: OctaneNode = MarkdownHooks({ ...options, fallback: rendered });
const safe: string = defaultUrlTransform('https://example.com');
type ExtraNode = ExtraProps['node'];
expectType<ExtraNode>(undefined);
void hooksRendered;
void asyncRendered;
void safe;

// @ts-expect-error children must be a string
const badOptions: Options = { children: 123 };
void badOptions;

// @ts-expect-error intrinsic remaps must name a valid intrinsic
const badComponents: Components = { h1: 'not-an-element' };
void badComponents;
