import { use } from 'octane';

export function ProjectedScene(props) @{
	const value = use(props.resource);
	<scene value={value} />
}

export function SequentialProjectedScene(props) @{
	const key = use(props.first);
	const value = use(props.secondFor(key));
	<scene value={value} />
}

export function PreparedProjectedScene(props) @{
	<scene value={props.value} />
}
