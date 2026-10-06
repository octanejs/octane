import { Suspense, useState } from 'octane';

export interface SettlingTextProps {
	/** Whether the component updates itself while its template renders. */
	settle: boolean;
	/** The text the first render shows. */
	first: string;
	/** The text the render after the update shows. */
	settled: string;
}

/**
 * A helper the template calls while it renders: before the settling update it
 * queues an update of the component's own state, which renders the component
 * again before the pass ends.
 */
function useSettleWhileRendering(settle: boolean): [boolean, () => string] {
	const [settled, setSettled] = useState(false);
	const settleNow = () => {
		if (settle && !settled) setSettled(true);
		return '';
	};
	return [settled, settleNow];
}

/** An only-child text binding after the update. */
export function SettlingText(props: SettlingTextProps) @{
	const [settled, settleNow] = useSettleWhileRendering(props.settle);
	<div>
		<i>{settleNow() as string}</i>
		<p>{(settled ? props.settled : props.first) as string}</p>
	</div>
}

/** A text binding beside an element, after the update. */
export function SettlingSiblingText(props: SettlingTextProps) @{
	const [settled, settleNow] = useSettleWhileRendering(props.settle);
	<div>
		<i>{settleNow() as string}</i>
		<p>
			<b>{'k'}</b>
			{(settled ? props.settled : props.first) as string}
		</p>
	</div>
}

/** An only-child renderable hole holding text, after the update. */
export function SettlingHoleText(props: SettlingTextProps) @{
	const [settled, settleNow] = useSettleWhileRendering(props.settle);
	<div>
		<i>{settleNow() as string}</i>
		<p>{settled ? props.settled : props.first}</p>
	</div>
}

/** SettlingText inside a Suspense boundary, beside content outside it. */
export function SettlingTextInSuspense(props: SettlingTextProps) @{
	<section>
		<b>{'outside'}</b>
		<Suspense fallback={<span>{'loading'}</span>}>
			<SettlingText {...props} />
		</Suspense>
	</section>
}
