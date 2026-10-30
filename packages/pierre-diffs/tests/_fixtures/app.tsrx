import type { DiffLineAnnotation, FileDiffMetadata } from '@pierre/diffs';
import { FileDiff, Virtualizer, WorkerPoolContextProvider } from '../../src/index.ts';

export interface DiffAppProps {
	fileDiff: FileDiffMetadata;
	lineAnnotations?: DiffLineAnnotation<string>[];
	prerenderedHTML?: string;
	virtualized?: boolean;
	metadata?: string;
}

function Diff(props: DiffAppProps) @{
	<FileDiff<string>
		fileDiff={props.fileDiff}
		disableWorkerPool
		className="diff"
		lineAnnotations={props.lineAnnotations}
		prerenderedHTML={props.prerenderedHTML}
		renderHeaderMetadata={() => <span class="meta">{props.metadata ?? 'metadata'}</span>}
		renderAnnotation={(annotation) => <span class="note">{annotation.metadata}</span>}
	/>
}

// jsdom has no Worker, and the diffs render on the main thread
// (`disableWorkerPool`), so the pool's workers never receive a task.
function createInertWorker(): Worker {
	return Object.assign(new EventTarget(), {
		postMessage() {},
		terminate() {},
	}) as unknown as Worker;
}

// A diff, optionally virtualized, inside the worker-pool provider T3 Code
// wraps its diff panels in.
export function DiffApp(props: DiffAppProps) @{
	<WorkerPoolContextProvider
		poolOptions={{ workerFactory: createInertWorker }}
		highlighterOptions={{}}
	>
		@if (props.virtualized) {
			<Virtualizer className="scroller">
				<Diff {...props} />
			</Virtualizer>
		} @else {
			<Diff {...props} />
		}
	</WorkerPoolContextProvider>
}
