import type { DropEvent, DropzoneOptions } from '../src/index.tsrx';

// Adapted from upstream type-tests/events.tsx: callbacks retain native event capabilities.
const onDrop: NonNullable<DropzoneOptions['onDrop']> = (acceptedFiles, fileRejections, event) => {
	console.log(acceptedFiles, fileRejections);
	event.preventDefault();
	event.stopPropagation();
	console.log(event.type);
};
const getFilesFromEvent: NonNullable<DropzoneOptions['getFilesFromEvent']> = (event) => {
	if (Array.isArray(event)) console.log(event[0]);
	else event.preventDefault();
	return Promise.resolve([]);
};
const nativeEvent: DropEvent = new Event('change');
export { getFilesFromEvent, nativeEvent, onDrop };
