import { Await, useAsyncError, useAsyncValue, useLoaderData } from '@octanejs/remix-router';

// <Await> conformance fixtures — the loader (configured in the test) returns
// `{ msg }` where `msg` is a per-test deferred promise or a raw value. Await
// suspends through octane's use(), so it sits inside an octane suspense
// boundary (@try/@pending) in the FIXTURE, mirroring upstream's <React.Suspense>
// wrapper (per data-memory-router-test.tsx's defer suite).

export function AwaitValueProbe() @{
	const value = useAsyncValue();
	<p class="value">{'got:' + String(value)}</p>
}

export function AwaitErrorProbe() @{
	const error = useAsyncError() as any;
	<p class="await-err">{'err:' + error.message}</p>
}

// Children form, with an Await-level errorElement.
export function AwaitPage() @{
	const data = useLoaderData() as any;
	<div>
		@try {
			<Await resolve={data.msg} errorElement={<AwaitErrorProbe />}>
				<AwaitValueProbe />
			</Await>
		} @pending {
			<p class="fallback">{'loading'}</p>
		}
	</div>
}

// Render-prop children form.
export function AwaitRenderPropPage() @{
	const data = useLoaderData() as any;
	<div>
		@try {
			<Await resolve={data.msg}>
				{(value: any) => <p class="value">{'rp:' + String(value)}</p>}
			</Await>
		} @pending {
			<p class="fallback">{'loading'}</p>
		}
	</div>
}

// NO Await-level errorElement — a rejection must bubble past the suspense
// boundary to the ROUTE-level errorElement configured in the test.
export function AwaitNoErrorElementPage() @{
	const data = useLoaderData() as any;
	<div>
		@try {
			<Await resolve={data.msg}>
				<AwaitValueProbe />
			</Await>
		} @pending {
			<p class="fallback">{'loading'}</p>
		}
	</div>
}
