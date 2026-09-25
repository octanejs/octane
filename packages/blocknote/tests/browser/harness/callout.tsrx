// Mirrors the "Custom blocks" recipe in packages/blocknote/README.md.
import { BlockNoteSchema, createBlockSpec, defaultBlockSpecs } from '@blocknote/core';
import { createRoot } from 'octane';

function CalloutIcon(props: { emoji: string }) @{
	<span class="callout-icon">{props.emoji}</span>
}

const Callout = createBlockSpec(
	{ type: 'callout', propSchema: { emoji: { default: '💡' } }, content: 'inline' },
	{
		render: (block) => {
			const dom = document.createElement('div');
			const icon = document.createElement('span');
			const contentDOM = document.createElement('div');
			dom.className = 'callout';
			icon.contentEditable = 'false';
			dom.append(icon, contentDOM);
			const root = createRoot(icon);
			root.render(CalloutIcon, { emoji: block.props.emoji });
			return { dom, contentDOM, destroy: () => root.unmount() };
		},
	},
);

export const schema = BlockNoteSchema.create({
	blockSpecs: { ...defaultBlockSpecs, callout: Callout() },
});
