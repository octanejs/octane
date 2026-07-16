import { use } from 'octane';
import { loadResource } from '../data.js';
import { useProjectBundle } from './useProjectBundle';

function ProjectBadge(props: { version: number }) @{
	const badge = use(loadResource('badge', props.version));
	<strong data-resource="badge">
		{badge.label as string}
	</strong>
}

function ProjectOwner(props: { version: number; ownerId: string }) @{
	const owner = use(loadResource('owner', props.version, props.ownerId));
	<span data-resource="owner">
		{owner.label as string}
	</span>
}

export function ProjectHeader(props: { version: number }) @{
	const bundle = useProjectBundle(props.version);
	<header data-panel="project">
		<h1 data-resource="project">
			{bundle.project.label as string}
		</h1>
		<p data-resource="viewer">
			{bundle.viewer.label as string}
		</p>
		<div class="project-meta">
			<ProjectBadge version={props.version} />
			<ProjectOwner version={props.version} ownerId={bundle.project.ownerId} />
		</div>
	</header>
}
