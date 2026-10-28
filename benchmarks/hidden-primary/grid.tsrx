import { createRoot, flushSync, Hydrate } from 'octane';
import { load } from 'octane/hydration';

function Grid({ rows, revision }: { rows: readonly number[]; revision: number }) @{
	<main>
		<output>{String(revision)}</output>
		@for (const row of rows; key row) {
			<Hydrate when={load()}>
				<span>{row + ':' + revision}</span>
			</Hydrate>
		}
	</main>
}

export function createGrid(container: HTMLElement, rows: readonly number[]) {
	const root = createRoot(container);
	return {
		update: (revision: number) => flushSync(() => root.render(Grid, { rows, revision })),
		unmount: () => root.unmount(),
	};
}
