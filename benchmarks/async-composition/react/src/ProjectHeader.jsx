import { use } from 'react';
import { loadResource } from '../../shared/data.js';
import { useProjectBundle } from './useProjectBundle.js';

function ProjectBadge({ version }) {
	const badge = use(loadResource('badge', version));
	return <strong data-resource="badge">{badge.label}</strong>;
}

function ProjectOwner({ version, ownerId }) {
	const owner = use(loadResource('owner', version, ownerId));
	return <span data-resource="owner">{owner.label}</span>;
}

export function ProjectHeader({ version }) {
	const bundle = useProjectBundle(version);
	return (
		<header data-panel="project">
			<h1 data-resource="project">{bundle.project.label}</h1>
			<p data-resource="viewer">{bundle.viewer.label}</p>
			<div className="project-meta">
				<ProjectBadge version={version} />
				<ProjectOwner version={version} ownerId={bundle.project.ownerId} />
			</div>
		</header>
	);
}
