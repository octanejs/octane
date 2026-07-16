import { useState } from 'octane';
import { fixturePageModuleState } from './Page.tsrx';
import { fixturePreHydrateModuleState } from './pre-hydrate.ts';

export default function Layout(props: { children: unknown }) @{
	const [moduleIdentity, setModuleIdentity] = useState('unchecked');
	const checkModuleIdentity = () => {
		setModuleIdentity(
			'page ' + (fixturePageModuleState.rendered ? 'shared' : 'duplicated') + '; pre-hydrate ' +
				(fixturePreHydrateModuleState.ran ? 'shared' : 'duplicated'),
		);
	};
	<div class="shell">
		<nav>{'fixture-nav'}</nav>
		<button onClick={checkModuleIdentity}>
			Check hydration module identity
		</button>
		<output data-hydration-module-identity="">
			{moduleIdentity as string}
		</output>
		{props.children}
	</div>
}
