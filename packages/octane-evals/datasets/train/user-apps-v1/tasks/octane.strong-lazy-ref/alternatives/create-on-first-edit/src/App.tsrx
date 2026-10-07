'use strong';
// Alternative: create the history in the first input event. Strong allows ref
// writes in events, and neither render nor the server builds a history. It is
// as valid as useLazyRef, which keeps creation in one place instead of in every
// handler that might run first.
import { useRef, useState } from 'octane';

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
	const history = useRef<DraftHistory | null>(null);

	<form>
		<textarea
			aria-label="Draft"
			value={draft}
			onInput={(event) => {
				history.current ??= createHistory();
				history.current.push(draft);
				setDraft(event.currentTarget.value);
				setUndoSteps(history.current.size);
			}}
		/>
		<button
			type="button"
			disabled={undoSteps === 0}
			onClick={() => {
				setDraft(history.current!.pop() ?? '');
				setUndoSteps(history.current!.size);
			}}
		>
			{'Undo'}
		</button>
	</form>
}
