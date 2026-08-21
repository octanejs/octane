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

const App: InkComponent<{ readonly label: string }> = () => null;
const options: RenderOptions = { interactive: false, maxFps: 60 };
const instance: Instance = render(App, { label: 'hello' }, options);
instance.rerender(App, { label: 'updated' });
const output: string = renderToString(App, { label: 'hello' }, { columns: 80 });

const box: (props: BoxProps) => unknown = Box;
const text: (props: TextProps) => unknown = Text;
const key = {} as Key;
const element = null as DOMElement | null;

void box;
void text;
void key;
void element;
void output;
