import { createElement, type OctaneNode } from 'octane';
import type { Unhead } from 'unhead/types';
import { UnheadProvider } from '@octanejs/unhead/client';

export function withHead(head: Unhead, child: OctaneNode): OctaneNode {
	return createElement(UnheadProvider, { head, children: child });
}

export function wait(ms = 10): Promise<void> {
	return new Promise(function resolveWait(resolve) {
		setTimeout(resolve, ms);
	});
}
