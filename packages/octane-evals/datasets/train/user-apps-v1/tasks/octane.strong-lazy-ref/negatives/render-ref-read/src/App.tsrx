'use strong';
// Workaround: create the history with useLazyRef and render its size.
import { useLazyRef, useState } from 'octane';

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
	const history = useLazyRef(createHistory);

	<form>
		<textarea
			aria-label="Draft"
			value={draft}
			onInput={(event) => {
				history.current.push(draft);
				setDraft(event.currentTarget.value);
			}}
		/>
		<button
			type="button"
			disabled={history.current.size === 0}
			onClick={() => {
				setDraft(history.current.pop() ?? '');
			}}
		>{'Undo'}</button>
	</form>
}
