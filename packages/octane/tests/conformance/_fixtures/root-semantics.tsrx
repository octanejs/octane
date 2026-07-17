import { useEffect, useState } from 'octane';

export function TextRoot(props) @{
	<div id="text-root">
		{props.text as string}
	</div>
}

export function DivRoot() @{
	<div id="div-root">{'div'}</div>
}

export function SpanRoot() @{
	<span id="span-root">{'span'}</span>
}

export function OrderedChildren(props) @{
	<div id="ordered-root">
		<span>
			{props.first as string}
		</span>
		<span>
			{props.second as string}
		</span>
	</div>
}

export function HydrationRoot(props) @{
	<div id="hydration-root">
		<span class={props.className}>
			{props.text as string}
		</span>
	</div>
}

export function KeyedRoot(props) @{
	const [initialText] = useState(props.text);
	useEffect(() => {
		props.log('Mount');
		return () => props.log('Unmount');
	}, []);
	<span id="keyed-root">
		{props.text + ':' + initialText as string}
	</span>
}

export function EffectUnmountRoot(props) @{
	useEffect(() => {
		if (props.step === 2) props.unmountOtherRoot();
	}, [props.step]);
	<span id="effect-root">{'Hi'}</span>
}

function ThrowingChild() {
	throw new Error('failed initial render');
}

export function EffectThenThrowRoot(props) @{
	useEffect(() => {
		props.log('effect');
		return () => props.log('cleanup');
	}, []);
	<section id="partial-root">
		<ThrowingChild />
	</section>
}
