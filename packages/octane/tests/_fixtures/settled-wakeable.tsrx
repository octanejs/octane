import { Activity, Suspense as SettledSuspense, use } from 'octane';

// Readers that keep suspending on a wakeable whose settlement has already been
// observed. Each retry re-suspends until external state changes on a later task.

export interface SettledReaderProps {
	read: () => string;
}

function SettledReader(props: SettledReaderProps) @{
	const value = props.read();
	<p class="resolved">{value as string}</p>
}

export function SettledTemplateBoundary(props: SettledReaderProps) @{
	<>
		@try {
			<SettledReader read={props.read} />
		} @pending {
			<p class="fallback">loading</p>
		}
	</>
}

export function SettledJsxBoundary(props: SettledReaderProps) @{
	<SettledSuspense fallback={<p class="fallback">loading</p>}>
		<SettledReader read={props.read} />
	</SettledSuspense>
}

export function SettledRoot(props: SettledReaderProps) @{
	<section>
		<SettledReader read={props.read} />
	</section>
}

export function SettledHiddenActivity(props: SettledReaderProps & { mode: 'hidden' | 'visible' }) @{
	<Activity mode={props.mode}>
		<SettledReader read={props.read} />
	</Activity>
}

export interface SettledUseProps {
	ready: () => boolean;
	thenable: PromiseLike<string>;
}

function SettledUseReader(props: SettledUseProps) @{
	if (!props.ready()) use(props.thenable);
	<p class="resolved">{'ready'}</p>
}

export function SettledUseBoundary(props: SettledUseProps) @{
	<>
		@try {
			<SettledUseReader ready={props.ready} thenable={props.thenable} />
		} @pending {
			<p class="fallback">loading</p>
		}
	</>
}
