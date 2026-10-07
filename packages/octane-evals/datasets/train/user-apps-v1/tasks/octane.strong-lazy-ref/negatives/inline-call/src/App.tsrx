'use strong';
// Workaround: create the history directly during render.
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
	const history = createHistory();

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
		>
			{'Undo'}
		</button>
	</form>
}
