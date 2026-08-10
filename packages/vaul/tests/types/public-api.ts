import {
	Drawer,
	type ContentProps,
	type OverlayProps,
	type PortalProps,
} from '../../src/index.tsrx';

const content: ContentProps = { forceMount: true, role: 'dialog' };
const overlay: OverlayProps = { forceMount: true, 'aria-hidden': true };
const portal: PortalProps = { forceMount: true, container: document.body };
const trigger: Parameters<typeof Drawer.Trigger>[0] = { type: 'button', disabled: false };

void [content, overlay, portal, trigger];

// @ts-expect-error forceMount matches the pinned Radix literal contract.
const invalidContent: ContentProps = { forceMount: false };
// @ts-expect-error Trigger preserves button props instead of accepting arbitrary properties.
const invalidTrigger: Parameters<typeof Drawer.Trigger>[0] = { href: '/not-a-button-prop' };

void [invalidContent, invalidTrigger];
