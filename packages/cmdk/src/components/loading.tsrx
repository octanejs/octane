// Command.Loading. A progressbar to render while async options load.
import type { LoadingProps } from '../types';

export function Loading(props: LoadingProps) @{
	const { progress, children, label = 'Loading...', ref: _ref, ...etc } = props;

	<div
		ref={props.ref}
		{...etc}
		cmdk-loading=""
		role="progressbar"
		aria-valuenow={progress}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-label={label}
	>
		<div aria-hidden={true}>{children}</div>
	</div>
}
