import { useState } from 'react';
import { StackBlitzEmbed } from '~/components/StackBlitzEmbed';
import { FrameworkIconTabs } from '~/components/FrameworkIconTabs';
import type { Framework, Library } from '~/libraries';

interface StackBlitzSectionProps {
	project: Library;
	branch: string;
	examplePath: string | ((framework: Framework) => string);
	title?: string | ((framework: Framework) => string);
}

export function StackBlitzSection({ project, branch, examplePath, title }: StackBlitzSectionProps) {
	const [framework, setFramework] = useState<Framework>(project.frameworks[0]);

	const resolvedPath =
		typeof examplePath === 'function'
			? examplePath(framework)
			: examplePath.replace('${framework}', framework);

	const resolvedTitle =
		typeof title === 'function'
			? title(framework)
			: (title?.replace('${framework}', framework) ??
				`tannerlinsley/${framework}-${project.id}: basic`);

	return (
		<div className="px-4">
			<div className="relative w-full bg-white dark:bg-gray-900 rounded-lg overflow-hidden shadow-xl">
				<FrameworkIconTabs
					frameworks={project.frameworks}
					value={framework}
					onChange={setFramework}
				/>
				<StackBlitzEmbed
					repo={project.repo}
					branch={branch}
					examplePath={resolvedPath}
					title={resolvedTitle}
				/>
			</div>
		</div>
	);
}
