// E8 — a composed reducer-store app: the most API-dense bridgeable example.
// createContext + useReducer + useContext + useMemo + useCallback wire a small
// store; a keyed list renders it and grows on dispatch. Stresses context
// propagation to multiple consumers AND the keyed reconciler over `.map`.
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

type Todo = { id: number; text: string };
type State = { todos: Todo[]; nextId: number };
type Action = { type: 'add'; text: string } | { type: 'remove'; id: number };

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case 'add':
			return {
				todos: [...state.todos, { id: state.nextId, text: action.text }],
				nextId: state.nextId + 1,
			};
		case 'remove':
			return { ...state, todos: state.todos.filter((t) => t.id !== action.id) };
	}
}

type Store = {
	todos: Todo[];
	add: (text: string) => void;
	remove: (id: number) => void;
};

const StoreContext = createContext<Store | null>(null);

export function TodoProvider(props: { children: unknown }) {
	const [state, dispatch] = useReducer(reducer, { todos: [{ id: 0, text: 'first' }], nextId: 1 });
	const store = useMemo<Store>(
		() => ({
			todos: state.todos,
			add: (text) => dispatch({ type: 'add', text }),
			remove: (id) => dispatch({ type: 'remove', id }),
		}),
		[state.todos],
	);
	return <StoreContext.Provider value={store}>{props.children}</StoreContext.Provider>;
}

function useStore(): Store {
	const store = useContext(StoreContext);
	if (!store) throw new Error('useStore outside TodoProvider');
	return store;
}

export function TodoList() {
	const { todos } = useStore();
	return (
		<ul className="list">
			{todos.map((t) => (
				<li key={t.id} className="item">
					{t.text}
				</li>
			))}
		</ul>
	);
}

export function AddButton() {
	const { add } = useStore();
	const onClick = useCallback(() => add('item'), [add]);
	return <button onClick={onClick}>add</button>;
}

export function App() {
	return (
		<TodoProvider>
			<TodoList />
			<AddButton />
		</TodoProvider>
	);
}
