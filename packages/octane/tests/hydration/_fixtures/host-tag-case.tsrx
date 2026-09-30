import { createElement } from 'octane';

// HTML tag names are ASCII case-insensitive: `createElement('DIV')` builds a
// `div`, and the parser reads a server's `<DIV>` as one. SVG names are
// case-sensitive (`foreignObject`, `linearGradient`).

// A pure-host descriptor at value position (the raw host reconcile).
export function PureHost(props: { tag: string; value: string }) @{
	<section id="pure">{createElement(props.tag, { id: 'el' }, `hello ${props.value}`)}</section>
}

function Label(props: { text: string }) @{
	<b id="label">{props.text as string}</b>
}

// A host descriptor with a component child (the host element Block path).
export function BlockHost(props: { tag: string; text: string }) @{
	<section id="block">{createElement(
		props.tag,
		{ id: 'el' },
		createElement(Label, { text: props.text }),
	)}</section>
}

// A dynamic host tag at template position. JSX types list only the canonical
// lowercase spellings, so the runtime casing is asserted to one of them.
export function DynamicTag(props: { tag: string; text: string }) @{
	const Tag = props.tag as 'h1';
	<section id="dynamic">
		<Tag id="el">{props.text as string}</Tag>
	</section>
}

// SVG control: SVG descriptors, including mixed-case names, under an <svg>.
// The HTML child of the foreignObject folds case like any HTML host.
export function SvgHost(props: { tag: string; value: string; stopTag?: string }) @{
	<svg id="svg">
		{createElement(
			'foreignObject',
			{ id: 'fo' },
			createElement(props.tag, { id: 'el' }, `hello ${props.value}`),
		)}
		{createElement(
			'linearGradient',
			{ id: 'grad' },
			createElement(props.stopTag ?? 'stop', { offset: props.value === 'A' ? '0' : '1' }),
		)}
	</svg>
}
