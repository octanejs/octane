/** Compile-only pins for the public server factories and React island overloads. */
import * as React from 'react';
import { createContext, createElement, renderToString } from 'octane/server';
import { ReactCompat, bridgeReactContext } from 'octane/react/server';
import {
	ClassCounter,
	Counter,
	ForwardedCounter,
	LazyCounter,
	MemoCounter,
} from './react-compat-components.react.js';

const inputRef = React.createRef<HTMLInputElement>();
const classRef = React.createRef<ClassCounter>();
const nativeTheme = createContext('server default');
const reactTheme = React.createContext('React default');
export const themeBridge = bridgeReactContext(nativeTheme, reactTheme);

export const componentForm = createElement(ReactCompat, {
	component: Counter,
	props: { label: 'server', start: 3, ref: inputRef },
});
export const childForm = createElement(ReactCompat, {
	children: createElement(Counter, { label: 'server', start: 3, ref: inputRef }),
});
export const plainServerComponent = createElement(() => childForm);
export const serverHtml: string = renderToString(() => plainServerComponent).html;

ReactCompat({ component: Counter, props: { label: 'server', start: 3, ref: inputRef } });
ReactCompat({ component: MemoCounter, props: { label: 'server', start: 3, ref: inputRef } });
ReactCompat({ component: LazyCounter, props: { label: 'server', start: 3 } });
ReactCompat({ component: ForwardedCounter, props: { label: 'server', start: 3, ref: inputRef } });
ReactCompat({ component: ClassCounter, props: { label: 'server', ref: classRef } });
ReactCompat({ component: Counter, props: { label: 'server', start: 3 }, contexts: [themeBridge] });

// @ts-expect-error — a server source context still controls the target value type.
bridgeReactContext(nativeTheme, React.createContext(1));

// @ts-expect-error — required React props stay required on the server.
ReactCompat({ component: Counter });
// @ts-expect-error — the component's own prop type controls the server overload.
ReactCompat({ component: Counter, props: { label: 'server', start: 'three' } });
const wrongForwardedProps = { label: 'server', start: 3, ref: React.createRef<HTMLDivElement>() };
// @ts-expect-error — a forwarded input ref cannot target a div.
ReactCompat({ component: ForwardedCounter, props: wrongForwardedProps });
// @ts-expect-error — a class ref targets the React instance.
ReactCompat({ component: ClassCounter, props: { label: 'server', ref: inputRef } });
// @ts-expect-error — server transport authoring forms are mutually exclusive.
ReactCompat({ component: Counter, props: { label: 'server', start: 3 }, children: childForm });
