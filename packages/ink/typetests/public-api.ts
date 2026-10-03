import {
	Box,
	Text,
	render,
	renderToString,
	type BoxProps,
	type DOMElement,
	type Instance,
	type InkComponent,
	type Key,
	type RenderOptions,
	type TextProps,
} from '../src/index.js';
import type { JSX as InkJSX } from '../src/intrinsics.js';

type Assert<T extends true> = T;
type Equal<Left, Right> =
	(<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;

const App: InkComponent<{ readonly label: string }> = () => null;
const options: RenderOptions = { interactive: false, maxFps: 60 };
const instance: Instance = render(App, { label: 'hello' }, options);
instance.rerender(App, { label: 'updated' });
const output: string = renderToString(App, { label: 'hello' }, { columns: 80 });

const box: (props: BoxProps) => unknown = Box;
const text: (props: TextProps) => unknown = Text;
const key = {} as Key;
const element = null as DOMElement | null;

// Under `jsx: preserve`, authored JSX children reach a component's `children`
// prop only through this attribute.
type _ChildrenAttributeIsChildren = Assert<
	Equal<keyof InkJSX.ElementChildrenAttribute, 'children'>
>;

void box;
void text;
void key;
void element;
void output;
