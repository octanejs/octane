function textNode(text) {
	return {
		detail: 0,
		format: 0,
		mode: 'normal',
		style: '',
		text,
		type: 'text',
		version: 1,
	};
}

function blockNode(block) {
	const common = {
		children: block.text ? [textNode(block.text)] : [],
		direction: block.text ? 'ltr' : null,
		format: '',
		indent: 0,
		version: 1,
	};
	if (block.type === 'heading') return { ...common, tag: block.tag, type: 'heading' };
	if (block.type === 'quote') return { ...common, type: 'quote' };
	return { ...common, textFormat: 0, textStyle: '', type: 'paragraph' };
}

function editorState(blocks) {
	return JSON.stringify({
		root: {
			children: blocks.map(blockNode),
			direction: 'ltr',
			format: '',
			indent: 0,
			type: 'root',
			version: 1,
		},
	});
}

export const documents = [
	{
		id: 'launch-brief',
		title: 'Launch brief',
		eyebrow: 'Strategy',
		updatedAt: 'Edited 12 min ago',
		editorState: editorState([
			{ type: 'heading', tag: 'h1', text: 'A quieter way to launch' },
			{
				type: 'paragraph',
				text: 'Pagecraft gives every release a shared narrative before the calendar fills up.',
			},
			{ type: 'heading', tag: 'h2', text: 'What success looks like' },
			{
				type: 'paragraph',
				text: 'A clear promise, a small group of committed readers, and feedback we can act on.',
			},
		]),
		version: 0,
	},
	{
		id: 'field-notes',
		title: 'Field notes',
		eyebrow: 'Research',
		updatedAt: 'Edited yesterday',
		editorState: editorState([
			{ type: 'heading', tag: 'h1', text: 'People protect their focus' },
			{
				type: 'paragraph',
				text: 'The strongest signal was not speed. It was knowing that unfinished work would still be there.',
			},
			{
				type: 'quote',
				text: 'I want the document to keep my place while the rest of the day moves around it.',
			},
		]),
		version: 0,
	},
	{
		id: 'editorial-calendar',
		title: 'Editorial calendar',
		eyebrow: 'Planning',
		updatedAt: 'Edited Monday',
		editorState: editorState([
			{ type: 'heading', tag: 'h1', text: 'Three stories for late summer' },
			{ type: 'paragraph', text: 'August — Work that leaves room to think.' },
			{ type: 'paragraph', text: 'September — The shape of a useful review.' },
			{ type: 'paragraph', text: 'October — Small systems, durable teams.' },
		]),
		version: 0,
	},
	{
		id: 'blank-page',
		title: 'Blank page',
		eyebrow: 'Draft',
		updatedAt: 'Not edited yet',
		editorState: editorState([{ type: 'paragraph', text: '' }]),
		version: 0,
	},
];
