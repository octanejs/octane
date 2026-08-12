import type { Accept, AcceptGroup, DropzoneOptions } from '../src/index.tsrx';

// Adapted from upstream type-tests/accept.tsx: both accepted public shapes remain assignable.
const accept: Accept = { 'image/*': ['.jpeg', '.png'] };
const groups: AcceptGroup[] = [
	{ description: 'Images', accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': [] } },
	{ accept: { 'application/pdf': '.pdf' } },
];
const objectOptions: DropzoneOptions = { accept };
const groupedOptions: DropzoneOptions = { accept: groups, useFsAccessApi: true };
export { accept, groups, groupedOptions, objectOptions };
