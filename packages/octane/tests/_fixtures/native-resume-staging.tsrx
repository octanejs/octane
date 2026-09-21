import { useLayoutEffect, ViewTransition } from 'octane';
import { createResource, createScope, query, type QueryContext } from 'octane/signals';

export function createStagedResource$(
	scopeKey: string,
	load: (key: string, context: QueryContext) => Promise<string>,
) {
	const scope = createScope({ scopeKey });
	const key$ = scope.signal$('key', 'a');
	const count$ = scope.signal$('count', 0);
	const request = query('native-resume-staging', load);
	const value$ = createResource(scope, 'value', () => request(scope.get(key$)));
	return { scope, key$, count$, value$ };
}

type StagedResource = ReturnType<typeof createStagedResource$>;

function StagedAsyncValue(props: StagedResource & { log: (entry: string) => void }) @{
	const value = props.scope.get(props.value$) as string;
	useLayoutEffect(() => {
		props.log('layout:' + value);
	}, [value]);
	<p
		class="async-value"
		ref={(node: HTMLParagraphElement | null) => {
			props.log('ref:' + value + ':' + (node === null ? 'detach' : 'attach'));
		}}
	>{value}</p>
}

export function StagedNativeResume(props: StagedResource & { log: (entry: string) => void }) @{
	<ViewTransition scope="element" name="resume">
		<section data-owner="resume">
			@try {
				<div class="panel">
					<p class="count">{String(props.scope.get(props.count$))}</p>
					<StagedAsyncValue {...props} />
				</div>
			} @pending {
				<p class="pending">{'loading'}</p>
			}
		</section>
	</ViewTransition>
}
