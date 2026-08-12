import type { ElementDescriptor } from 'octane';
import { processAsync } from './processor';
import { projectTree } from './project';
import type { Options } from './types';

export async function MarkdownAsync(options: Readonly<Options>): Promise<ElementDescriptor> {
	return projectTree(await processAsync(options), options.components);
}
