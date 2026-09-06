import { createPortal } from 'octane';

declare const element: HTMLElement;
declare const fragment: DocumentFragment;
declare const shadow: ShadowRoot;
createPortal('content', element);
createPortal('content', fragment);
createPortal('content', shadow);
// @ts-expect-error A text node cannot contain portal children.
createPortal('content', document.createTextNode('text'));
// @ts-expect-error A document is not a portal container.
createPortal('content', document);
