import { useEnvironment } from '@octanejs/drei';

function LoadedEnvironment(props) @{
	const texture = useEnvironment(props.options);
	props.onLoad(texture);
	null;
}

export function EnvironmentBoundary(props) @{
	@try {
		<LoadedEnvironment {...props} />
	} @pending {
		null;
	}
}

function LoadedDefaultEnvironment(props) @{
	const texture = useEnvironment();
	props.onLoad(texture);
	null;
}

export function DefaultEnvironmentBoundary(props) @{
	@try {
		<LoadedDefaultEnvironment {...props} />
	} @pending {
		null;
	}
}
