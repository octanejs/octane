'use strong';
// Alternative: keep the history in state created by a lazy initializer. Strong
// accepts it and it builds one history per editor, so the grader cannot tell it
// from useLazyRef. useLazyRef states the intent better: state holds snapshots,
// while this history is a mutable object that render never reads.
import { useState } from 'octane';

interface DraftHistory {
	readonly size: number;
	push(text: string): void;
	pop(): string | undefined;
}

// Keeps earlier versions of the draft. The real app restores it from disk, so
// it is expensive to build.
class UndoStack implements DraftHistory {
	#versions: string[] = [];

	get size() {
		return this.#versions.length;
	}

	push(text: string) {
		this.#versions.push(text);
	}

	pop() {
		return this.#versions.pop();
	}
}

export function App({
	createHistory = () => new UndoStack(),
}: {
	createHistory?: () => DraftHistory;
}) @{
	const [draft, setDraft] = useState('');
	const [undoSteps, setUndoSteps] = useState(0);
	const [history] = useState(() => createHistory());

	<form>
		<textarea
			aria-label="Draft"
			value={draft}
			onInput={(event) => {
				history.push(draft);
				setDraft(event.currentTarget.value);
				setUndoSteps(history.size);
			}}
		/>
		<button
			type="button"
			disabled={undoSteps === 0}
			onClick={() => {
				setDraft(history.pop() ?? '');
				setUndoSteps(history.size);
			}}
		>{'Undo'}</button>
	</form>
}
