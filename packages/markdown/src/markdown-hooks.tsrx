import type { Root } from 'hast';
import { useEffect, useState, type OctaneNode } from 'octane';
import { createFile, createProcessor, transformTree } from './processor';
import { projectTree } from './project';
import type { HooksOptions } from './types';

export function MarkdownHooks(options: Readonly<HooksOptions>): OctaneNode {
	const processor = createProcessor(options);
	const [error, setError] = useState<Error | undefined>(undefined);
	const [tree, setTree] = useState<Root | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		const file = createFile(options);

		processor.run(processor.parse(file), file, (nextError, nextTree) => {
			if (!cancelled) {
				setError(nextError);
				setTree(nextTree);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [
		options.children,
		options.rehypePlugins,
		options.remarkPlugins,
		options.remarkRehypeOptions,
	]);

	if (error) throw error;

	return tree ? projectTree(transformTree(tree, options), options.components) : options.fallback;
}
