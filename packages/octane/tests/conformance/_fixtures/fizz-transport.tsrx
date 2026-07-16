import { use } from 'octane';

function ThrowError(props) {
	throw props.error;
}

function PendingBoundary(props) @{
	@try {
		const value = use(props.promise);
		<strong class="pending-value">
			{value as string}
		</strong>
	} @pending {
		<i class="pending-fallback">{'loading'}</i>
	}
}

export function TextPayload(props) @{
	<div id="transport-payload">
		{props.text as string}
	</div>
}

export function PendingPayload(props) @{
	<section id="transport-pending">
		<PendingBoundary promise={props.promise} />
	</section>
}

export function TwoPendingBoundaries(props) @{
	<main id="two-pending-boundaries">
		<PendingBoundary promise={props.promise} />
		<PendingBoundary promise={props.promise} />
	</main>
}

export function FatalFallback(props) @{
	<section id="fatal-fallback">
		@try {
			const value = use(props.promise);
			<strong>
				{value as string}
			</strong>
		} @pending {
			<ThrowError error={props.error} />
		}
	</section>
}

export function ErrorInsideBoundary(props) @{
	<section id="error-inside-boundary">
		@try {
			<ThrowError error={props.error} />
		} @pending {
			<i class="error-boundary-fallback">{'loading'}</i>
		}
	</section>
}

export function PendingThenRootError(props) @{
	<>
		<PendingBoundary promise={props.promise} />
		<ThrowError error={props.error} />
	</>
}

export function CompleteContent(props) @{
	<section id="complete-content">
		@try {
			<strong>{'ready'}</strong>
		} @pending {
			const ignored = props.onFallback();
			<i>
				{ignored as string}
			</i>
		}
	</section>
}

export function BarePendingRoot(props) @{
	const value = use(props.promise);
	<main id="bare-pending-root">
		{value as string}
	</main>
}

export function AbortBeforeSuspend(props) @{
	props.abort();
	<section id="abort-before-suspend">
		<PendingBoundary promise={props.promise} />
	</section>
}

export function SuspendedFallbackAndContent(props) @{
	<section id="suspended-fallback-and-content">
		@try {
			@try {
				const content = use(props.content);
				<strong>
					{content as string}
				</strong>
			} @pending {
				const fallback = use(props.fallback);
				<em>
					{fallback as string}
				</em>
			}
		} @pending {
			<i class="outer-fallback">{'Loading'}</i>
		}
	</section>
}

function RootTasks(props) @{
	props.onRender();
	const one = use(props.one);
	const two = use(props.two);
	<span>
		{one + two as string}
	</span>
}

export function BoundaryAndRootTasks(props) @{
	<>
		<PendingBoundary promise={props.boundary} />
		<RootTasks one={props.one} two={props.two} onRender={props.onRootRender} />
	</>
}

export function DocumentTitle(props) @{
	<>
		<title>
			{props.title as string}
		</title>
		<main>{'body'}</main>
	</>
}
