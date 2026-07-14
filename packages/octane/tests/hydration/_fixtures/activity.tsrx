import { Activity, useEffect, useId, useState } from 'octane';

function StatefulChild(props) @{
	const [count, setCount] = useState(0);
	props.onRender?.();
	useEffect(() => {
		props.onEffect?.('mount');
		return () => props.onEffect?.('cleanup');
	}, []);
	<button id={props.id} onClick={() => setCount((value) => value + 1)}>
		{props.id + ':' + count}
	</button>
}

export function ActivityHydration(props) @{
	<section id="activity-host">
		<Activity mode={props.mode}>
			<StatefulChild id="activity-child" onRender={props.onRender} onEffect={props.onEffect} />
		</Activity>
		<span id="activity-tail">{'tail'}</span>
	</section>
}

export function NestedActivityHydration(props) @{
	<div id="nested-activity-host">
		<Activity mode={props.outer}>
			<span id="outer-before">{'before'}</span>
			<Activity mode={props.inner}>
				<StatefulChild id="inner-child" onEffect={props.onEffect} />
			</Activity>
			<span id="outer-after">{'after'}</span>
		</Activity>
		<i id="nested-tail">{'tail'}</i>
	</div>
}

function IdChild(props) @{
	const id = useId();
	<span class={props.className} id={id}>{id}</span>
}

export function ActivityIdHydration() @{
	<div id="activity-id-host">
		<Activity mode="hidden">
			<IdChild className="hidden-id" />
		</Activity>
		<IdChild className="visible-id" />
	</div>
}
