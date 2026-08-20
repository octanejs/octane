import { createElement as h, type OctaneNode } from 'octane';
import { StickToBottom, useStickToBottomContext } from '@octanejs/stick-to-bottom';

export function HookProbe(): OctaneNode {
	useStickToBottomContext();
	return h('div');
}

export function StickProbe(): OctaneNode {
	return h(StickToBottom, {
		style: { height: '80px' },
		children: h(StickToBottom.Content, {
			scrollClassName: 'scroll',
			'data-content': '',
			children: h('div', { children: 'hello' }),
		}),
	});
}
