import { PortableText } from '@octanejs/portabletext';
import type { OctaneNode } from 'octane';

export const portableTextValue = [
	{
		_type: 'block',
		_key: 'heading',
		style: 'h2',
		markDefs: [],
		children: [
			{ _type: 'span', _key: 'heading-span', text: 'Portable Text', marks: [] },
		],
	},
	{
		_type: 'block',
		_key: 'paragraph',
		style: 'normal',
		markDefs: [
			{ _type: 'link', _key: 'docs-link', href: 'https://portabletext.org' },
		],
		children: [
			{ _type: 'span', _key: 'plain', text: 'Render ', marks: [] },
			{ _type: 'span', _key: 'strong', text: 'structured', marks: ['strong'] },
			{ _type: 'span', _key: 'space', text: ' ', marks: [] },
			{ _type: 'span', _key: 'linked', text: 'content', marks: ['docs-link'] },
			{ _type: 'span', _key: 'break', text: '\n', marks: [] },
			{ _type: 'span', _key: 'tail', text: 'everywhere.', marks: [] },
		],
	},
	{
		_type: 'block',
		_key: 'list-one',
		style: 'normal',
		listItem: 'bullet',
		level: 1,
		markDefs: [],
		children: [
			{ _type: 'span', _key: 'list-one-span', text: 'Client', marks: [] },
		],
	},
	{
		_type: 'block',
		_key: 'list-two',
		style: 'normal',
		listItem: 'bullet',
		level: 1,
		markDefs: [],
		children: [
			{ _type: 'span', _key: 'list-two-span', text: 'Server', marks: [] },
		],
	},
	{ _type: 'callout', _key: 'callout', message: 'Framework-neutral data' },
];

function Callout(props: { value: { _type: string; message: string }; isInline: boolean }) @{
	<aside data-inline={String(props.isInline)}>{props.value.message}</aside>
}

function CustomNormal(props: { children?: OctaneNode }) @{
	<p className="portable-paragraph">{props.children}</p>
}

export function DefaultPortableTextFixture() @{
	<article id="default-portable-text">
		<PortableText value={portableTextValue} />
	</article>
}

export function CustomPortableTextFixture() @{
	<article id="custom-portable-text">
		<PortableText
			value={portableTextValue}
			components={{
				types: { callout: Callout },
				block: { normal: CustomNormal },
				hardBreak: false,
			}}
		/>
	</article>
}
