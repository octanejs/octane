import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultEntryDirectory = path.resolve(sourceDirectory, 'default-entry');

export const octaneStartDefaultEntryPaths = {
	client: path.resolve(defaultEntryDirectory, 'client.js'),
	server: path.resolve(defaultEntryDirectory, 'server.js'),
	start: path.resolve(defaultEntryDirectory, 'start.js'),
};
