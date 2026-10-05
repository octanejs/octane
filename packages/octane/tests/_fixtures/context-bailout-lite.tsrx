import { Activity, createContext, memo, useContext } from 'octane';

const Identity = createContext({ label: 'default' });

function Grandchild(props: { id: string }) @{
	const identity = useContext(Identity);
	<output data-owner={props.id}>{identity.label as string}</output>
}

function Middle(props: { id: string }) @{
	<section>
		<Grandchild id={props.id} />
	</section>
}

function View(props: { id: string }) @{
	<article>
		<Middle id={props.id} />
	</article>
}
const MemoView = memo(View);

export function AppLite(props: {
	memoized: boolean;
	identity: { label: string };
	active: string;
	retained: { id: string }[];
}) @{
	<Identity value={props.identity}>
		@for (const item of props.retained; key item.id) {
			<Activity mode={item.id === props.active ? 'visible' : 'hidden'}>
				@if (props.memoized) {
					<MemoView id={item.id} />
				} @else {
					<View id={item.id} />
				}
			</Activity>
		}
	</Identity>
}
