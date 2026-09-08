import { Route, Router, type RouterProps } from '@octanejs/wouter';

export function NestedElementRoute(props: { hook: RouterProps['hook'] }) @{
	<Router hook={props.hook}>
		<Route path="/about">
			<span>about</span>
		</Route>
	</Router>
}

export function RenderPropRoute(props: { hook: RouterProps['hook'] }) @{
	<Router hook={props.hook}>
		<Route path="/users/:id">
			{(params: { id?: string }) => <span>{params.id as string}</span>}
		</Route>
	</Router>
}
