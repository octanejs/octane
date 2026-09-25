import { createElement, type ReactElement } from 'octane';

// React's `createElement(type, props?: (Attributes & P) | null, ...children)`
// accepts `null` as the config; Octane's runtime already normalizes it.
function Leaf(props: { label?: string }): void {
	void props;
}
function Labelled(props: { label: string }): void {
	void props;
}

const componentNull: ReactElement = createElement(Leaf, null);
const componentNullChild: ReactElement = createElement(Leaf, null, 'child');
const hostNull: ReactElement = createElement('div', null, 'x');
const hostNullChildren: ReactElement = createElement('div', null, 'a', createElement('span', null));

// A bare `null` config infers props from `type` alone, never as `null`.
const componentNullProps: { label?: string } = createElement(Leaf, null).props;
// @ts-expect-error A null config does not type the descriptor's props as null.
const hostNullProps: null = createElement('div', null).props;

// A nullable config variable is accepted and still infers from its object type.
declare const maybeLabelled: { label: string } | null;
const nullableConfig: ReactElement<{ label: string }> = createElement(Labelled, maybeLabelled);

// A non-null config still enforces the component's declared props.
const labelled: ReactElement = createElement(Labelled, { label: 'ok' });
// @ts-expect-error Required props remain required when a config object is given.
const missingLabel = createElement(Labelled, {});
// @ts-expect-error Prop types are still checked against the component.
const wrongLabel = createElement(Labelled, { label: 1 });
