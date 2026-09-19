import { createContext, Hydrate, useContext, type OctaneNode, type HydrateProps } from 'octane';

const Theme = createContext('default');
export { Theme };

export function Reader() @{
	<span>{useContext(Theme) as string}</span>
}

export function App(props: { when: HydrateProps['when']; value: string; children: OctaneNode }) @{
	<Hydrate when={props.when}>
		<Theme value={props.value} children={props.children} />
	</Hydrate>
}
