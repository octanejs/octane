import { Hydrate, use, useLayoutEffect, type HydrateProps } from 'octane';
import { signal$ } from 'octane/signals';

export const route$ = signal$('home');

export type CommitObservation = {
	id: string;
	rendered: string;
	current: string;
	text: string | null;
};

export type ReaderProps = {
	id: string;
	observe?: (observation: CommitObservation) => void;
	cleanup?: (id: string) => void;
	suspend?: () => void;
	nestedWhen?: HydrateProps['when'];
};

export type DocumentProps =
	Omit<ReaderProps, 'id'> & {
		when: HydrateProps['when'];
		secondWhen?: HydrateProps['when'];
	};

export function IndependentReader() @{
	const route = route$.get();
	useLayoutEffect(() => {
		document.dispatchEvent(
			new CustomEvent<CommitObservation>('initial-document-commit', {
				detail: {
					id: 'independent',
					rendered: route,
					current: route$.get(),
					text: document.querySelector('[data-reader="independent"] > output')?.textContent ?? null,
				},
			}),
		);
	}, []);
	<section data-reader="independent">
		<output>{route as string}</output>
		<input aria-label="independent" defaultValue="server draft" />
	</section>
}

function ReaderContent({ id, observe, cleanup, suspend }: Omit<ReaderProps, 'nestedWhen'>) @{
	const route = route$.get();
	suspend?.();
	useLayoutEffect(() => {
		observe?.({
			id,
			rendered: route,
			current: route$.get(),
			text: document.querySelector(`[data-reader="${id}"] > output`)?.textContent ?? null,
		});
		return () => cleanup?.(id);
	}, []);
	<>
		<output>{route as string}</output>
		<input aria-label={id} defaultValue="server draft" />
	</>
}

function Reader({ id, observe, cleanup, suspend, nestedWhen }: ReaderProps) @{
	<section data-reader={id}>
		<ReaderContent id={id} observe={observe} cleanup={cleanup} suspend={suspend} />
		@if (nestedWhen) {
			<Hydrate split={false} when={nestedWhen}>
				<Reader id="nested" observe={observe} cleanup={cleanup} />
			</Hydrate>
		}
	</section>
}

function Heading({ observe, cleanup }: Pick<ReaderProps, 'observe' | 'cleanup'>) @{
	const route = route$.get();
	useLayoutEffect(() => {
		observe?.({
			id: 'heading',
			rendered: route,
			current: route$.get(),
			text: document.querySelector('h1')?.textContent ?? null,
		});
		return () => cleanup?.('heading');
	}, []);
	<h1>{route as string}</h1>
}

export function Document({
	when,
	secondWhen,
	observe,
	cleanup,
	suspend,
	nestedWhen,
}: DocumentProps) @{
	<main>
		<Heading observe={observe} cleanup={cleanup} />
		<Hydrate split={false} when={when}>
			<Reader
				id="first"
				observe={observe}
				cleanup={cleanup}
				suspend={suspend}
				nestedWhen={nestedWhen}
			/>
		</Hydrate>
		<Hydrate split={false} when={secondWhen ?? when}>
			<Reader id="second" observe={observe} cleanup={cleanup} />
		</Hydrate>
	</main>
}

export function Region({ when, ...props }: ReaderProps & { when: HydrateProps['when'] }) @{
	<Hydrate split={false} when={when}>
		<Reader {...props} />
	</Hydrate>
}

export function StreamedRegion({ ready, when, ...props }: ReaderProps & {
	ready: Promise<void>;
	when: HydrateProps['when'];
}) @{
	<article>
		@try {
			use(ready);
			<Hydrate split={false} when={when}>
				<Reader {...props} />
			</Hydrate>
		} @pending {
			<p>Waiting for the region</p>
		}
	</article>
}
