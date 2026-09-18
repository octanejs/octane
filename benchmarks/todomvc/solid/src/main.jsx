import { createMemo, createSignal, For, Show, flush } from 'solid-js';
import { render } from '@solidjs/web';

// TodoMVC fixture (Solid 2.0) — same DOM contract as the sibling apps (see
// ../../README.md). Authored in the canonical fastest-version shape (the
// js-framework `solid-next` pattern): a `createSignal` of the todo ARRAY for
// structure, PER-TODO FIELD SIGNALS (completed/title) for mutation — a
// toggle-all is N signal writes on retained rows (no row-object or DOM
// rebuild), while derived scans (visible/remaining) stay raw-array fast.
// Solid 2.0-beta batches and flushes on a microtask, so every handler calls
// `flush()` after its set — the commit lands inside the harness's timed,
// synchronous interaction window (same adaptation as the js-framework column).

let nextId = 1;

function TodoApp() {
	const [todos, setTodos] = createSignal([]);
	const [filter, setFilter] = createSignal('all');
	const [editing, setEditing] = createSignal(null);

	const addTodo = (e) => {
		if (e.key !== 'Enter') return;
		const input = e.target;
		const title = input.value.trim();
		if (title === '') return;
		setTodos((t) => {
			const [completed, setCompleted] = createSignal(false);
			const [titleSig, setTitle] = createSignal(title);
			return [...t, { id: nextId++, title: titleSig, setTitle, completed, setCompleted }];
		});
		flush();
		input.value = '';
	};
	const toggle = (id) => {
		const x = todos().find((x) => x.id === id);
		if (x) x.setCompleted((c) => !c);
		flush();
	};
	const destroy = (id) => {
		setTodos((t) => t.filter((x) => x.id !== id));
		flush();
	};
	const toggleAll = (e) => {
		const on = e.target.checked;
		for (const x of todos()) if (x.completed() !== on) x.setCompleted(on);
		flush();
	};
	const clearCompleted = () => {
		setTodos((t) => t.filter((x) => !x.completed()));
		flush();
	};
	const startEdit = (id) => {
		setEditing(id);
		flush();
	};
	const commitEdit = (id, e) => {
		const title = e.target.value.trim();
		if (title === '') setTodos((t) => t.filter((x) => x.id !== id));
		else {
			const x = todos().find((x) => x.id === id);
			if (x) x.setTitle(title);
		}
		setEditing(null);
		flush();
	};
	const editKeyDown = (id, e) => {
		if (e.key === 'Enter') commitEdit(id, e);
		else if (e.key === 'Escape') {
			setEditing(null);
			flush();
		}
	};

	// Derived scans as MEMOS (canonical Solid): one O(N) read of the completed
	// signals per change, shared by every binding — instead of each of the
	// footer's three bindings re-scanning (and re-subscribing to) all N signals.
	const visible = createMemo(() => {
		const f = filter();
		const t = todos();
		return f === 'active'
			? t.filter((x) => !x.completed())
			: f === 'completed'
				? t.filter((x) => x.completed())
				: t;
	});
	const remaining = createMemo(() => todos().filter((t) => !t.completed()).length);
	const anyCompleted = () => todos().length - remaining() > 0;

	return (
		<section class="todoapp">
			<header class="header">
				<h1>todos</h1>
				<input class="new-todo" placeholder="What needs to be done?" onKeyDown={addTodo} />
			</header>
			<Show when={todos().length > 0}>
				<section class="main">
					<input
						id="toggle-all"
						class="toggle-all"
						type="checkbox"
						checked={remaining() === 0}
						onClick={toggleAll}
					/>
					<ul class="todo-list">
						<For each={visible()}>
							{(t) => (
								<li
									class={(t.completed() ? 'completed' : '') + (editing() === t.id ? ' editing' : '')}
								>
									<div class="view">
										<input
											class="toggle"
											type="checkbox"
											checked={t.completed()}
											onClick={() => toggle(t.id)}
										/>
										<label onDblClick={() => startEdit(t.id)} textContent={t.title()} />
										<button class="destroy" onClick={() => destroy(t.id)}></button>
									</div>
									{editing() === t.id ? (
										<input
											class="edit"
											value={t.title()}
											onKeyDown={(e) => editKeyDown(t.id, e)}
											onBlur={(e) => commitEdit(t.id, e)}
										/>
									) : null}
								</li>
							)}
						</For>
					</ul>
				</section>
				<footer class="footer">
					<span class="todo-count">
						<strong>{remaining()}</strong>
						{remaining() === 1 ? ' item left' : ' items left'}
					</span>
					<ul class="filters">
						<li>
							<a
								class={filter() === 'all' ? 'selected' : ''}
								data-filter="all"
								onClick={() => {
									setFilter('all');
									flush();
								}}
							>
								All
							</a>
						</li>
						<li>
							<a
								class={filter() === 'active' ? 'selected' : ''}
								data-filter="active"
								onClick={() => {
									setFilter('active');
									flush();
								}}
							>
								Active
							</a>
						</li>
						<li>
							<a
								class={filter() === 'completed' ? 'selected' : ''}
								data-filter="completed"
								onClick={() => {
									setFilter('completed');
									flush();
								}}
							>
								Completed
							</a>
						</li>
					</ul>
					<Show when={anyCompleted()}>
						<button class="clear-completed" onClick={clearCompleted}>
							Clear completed
						</button>
					</Show>
				</footer>
			</Show>
		</section>
	);
}

render(() => <TodoApp />, document.getElementById('main'));
