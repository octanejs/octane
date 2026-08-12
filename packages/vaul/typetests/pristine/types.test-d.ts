// Pristine side: published vaul@1.1.2 typings, compiled with plain tsc.
// Assertion groups are listed in ../assertions.md and must stay one-for-one
// with packages/vaul/tests/types/public-api.ts for the shared surface.
import { Drawer, type ContentProps } from 'vaul';

const content: ContentProps = { forceMount: true, role: 'dialog' };
const trigger: Parameters<typeof Drawer.Trigger>[0] = { type: 'button', disabled: false };

void [content, trigger];

// @ts-expect-error forceMount matches the pinned Radix literal contract.
const invalidContent: ContentProps = { forceMount: false };
// @ts-expect-error Trigger preserves button props instead of accepting arbitrary properties.
const invalidTrigger: Parameters<typeof Drawer.Trigger>[0] = { href: '/not-a-button-prop' };

void [invalidContent, invalidTrigger];
