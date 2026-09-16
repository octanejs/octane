import { Hydrate, useLayoutEffect, ViewTransition } from 'octane';
import type { HydrateWhen } from 'octane/hydration';
import { signal$ } from 'octane/signals';
import type { SignalHandle } from 'octane/signals';

export function StagingSignalControls(props: {
	phase: string;
	draft$: SignalHandle<string> | string;
	inputProps$: { value: SignalHandle<string> | string };
	cleanups: string[];
}) @{
	<ViewTransition>
		<section>
			<span>{props.phase as string}</span>
			<input data-control="direct" value={props.draft$} />
			<input data-control="spread" {...props.inputProps$} />
			<StagingBindingPresentation phase={props.phase} />
			@if (props.phase === 'before') {
				<>
					<StagingSignalOwner name="first" cleanups={props.cleanups} />
					<StagingSignalOwner name="second" cleanups={props.cleanups} />
				</>
			}
		</section>
	</ViewTransition>
}

export function StagingBindingPresentation(props: { phase: string }) @{
	'use dom bindings';
	<article data-presentation>
		<p data-binding-text>{props.phase + ' text'}</p>
		<p data-binding-value>{props.phase}</p>
		@if (props.phase === 'before') {
			<i data-binding-arm>{props.phase as string}</i>
		} @else {
			<b data-binding-arm>
				{props.phase as string}
				<em>tail</em>
			</b>
		}
	</article>
}

export function StagingHydratedBinding(props: {
	phase: string;
	when: HydrateWhen;
}) @{
	<ViewTransition>
		<Hydrate split={false} when={props.when}>
			<StagingBindingPresentation phase={props.phase} />
		</Hydrate>
	</ViewTransition>
}

function StagingSignalOwner(props: { name: string; cleanups: string[] }) @{
	const value$ = signal$(0);
	useLayoutEffect(() => {
		return () => {
			props.cleanups.push(props.name + ':' + value$.get());
		};
	}, []);
	<button data-owner={props.name} onClick={() => value$.set(value$.get() + 1)}>{String(
		value$.get(),
	)}</button>
}
