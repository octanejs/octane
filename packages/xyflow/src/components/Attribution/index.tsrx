import type { PanelPosition, ProOptions } from '@xyflow/system';

import { Panel } from '../Panel/index.tsrx';

// Kept module-local so browser consumers do not need `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

type AttributionProps = {
	proOptions?: ProOptions;
	position?: PanelPosition;
};

const link = `https://reactflow.dev${
	process.env.NODE_ENV === 'production' ? '?utm_source=attribution' : '/attribution'
}`;

export function Attribution({ proOptions, position = 'bottom-right' }: AttributionProps) {
	if (proOptions?.hideAttribution) {
		return null;
	}

	return <Panel
		position={position}
		className="react-flow__attribution"
		data-message={`Please only hide this attribution when you are subscribed to React Flow Pro: ${link}`}
	>
		<a href={link} target="_blank" rel="noopener noreferrer" aria-label="React Flow attribution">
			React Flow
		</a>
	</Panel>;
}
