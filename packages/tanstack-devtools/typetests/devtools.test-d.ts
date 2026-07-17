import { expectTypeOf } from 'vitest';
import { TanStackDevtools } from '../src/index';
import type { TanStackDevtoolsOctaneInit, TanStackDevtoolsOctanePlugin } from '../src/index';

// The component accepts the init object.
expectTypeOf(TanStackDevtools).parameter(0).toEqualTypeOf<TanStackDevtoolsOctaneInit>();

// plugins / config / eventBusConfig are all optional.
const empty: TanStackDevtoolsOctaneInit = {};
void empty;

// A plugin's `render` accepts both an element value and an (el, props) => element
// function; `name` accepts a string or the same render union.
const elementPlugin: TanStackDevtoolsOctanePlugin = {
	id: 'a',
	name: 'A',
	render: 'anything renderable',
};
void elementPlugin;

const functionPlugin: TanStackDevtoolsOctanePlugin = {
	id: 'b',
	name: (el, props) => {
		expectTypeOf(el).toEqualTypeOf<HTMLElement>();
		expectTypeOf(props.devtoolsOpen).toEqualTypeOf<boolean>();
		return props.theme;
	},
	render: (el, props) => {
		expectTypeOf(el).toEqualTypeOf<HTMLElement>();
		return props.theme;
	},
};
void functionPlugin;

// customTrigger lives on config and receives the trigger theme.
const withTrigger: TanStackDevtoolsOctaneInit = {
	config: {
		customTrigger: (el, props) => {
			expectTypeOf(el).toEqualTypeOf<HTMLElement>();
			return props.theme;
		},
	},
};
void withTrigger;

// @ts-expect-error - a plugin must provide a render
const missingRender: TanStackDevtoolsOctanePlugin = { id: 'c', name: 'C' };
void missingRender;
