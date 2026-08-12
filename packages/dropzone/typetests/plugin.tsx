import type { DropEvent, DropzoneOptions } from '../src/index.tsrx';

const fromDragEvent = async (event: DropEvent | FileSystemFileHandle[]): Promise<File[]> => {
	if (Array.isArray(event)) return [];
	const dataTransfer = (event as DragEvent).dataTransfer;
	return dataTransfer ? Array.from(dataTransfer.files) : [];
};
const fromDataTransferItems = async (
	event: DropEvent | FileSystemFileHandle[],
): Promise<DataTransferItem[]> => {
	if (Array.isArray(event)) return [];
	const dataTransfer = (event as DragEvent).dataTransfer;
	return dataTransfer ? Array.from(dataTransfer.items) : [];
};
const filesPlugin: DropzoneOptions = { getFilesFromEvent: fromDragEvent };
const itemsPlugin: DropzoneOptions = { getFilesFromEvent: fromDataTransferItems };
export { filesPlugin, itemsPlugin };
