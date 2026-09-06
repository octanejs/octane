export * as Dialog from './index.parts';

export type * from './root/DialogRoot.tsrx';
export type * from './trigger/DialogTrigger.tsrx';
export type * from './portal/DialogPortal.tsrx';
export type * from './popup/DialogPopup.tsrx';
export type * from './backdrop/DialogBackdrop.tsrx';
export type * from './title/DialogTitle.tsrx';
export type * from './description/DialogDescription.tsrx';
export type * from './close/DialogClose.tsrx';
export type * from './viewport/DialogViewport.tsrx';

// Retain the named runtime exports of the previous Octane binding.
export { Handle as DialogHandle, createHandle as createDialogHandle } from './index.parts';
