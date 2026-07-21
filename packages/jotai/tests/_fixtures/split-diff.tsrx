import { atom, useAtom, useSetAtom } from '@octanejs/jotai';
import { splitAtom } from '@octanejs/jotai/utils';

// Differential fixture: a splitAtom todo list — add (list write), per-item
// toggle (item-atom write), and remove (split dispatch) — keyed rendering must
// stay byte-identical with real jotai on React.
const todosAtom = atom([
	{ id: 1, text: 'one', done: false },
	{ id: 2, text: 'two', done: false },
]);
const todoAtomsAtom = splitAtom(todosAtom);
let nextId = 3;

function Todo(props: { todoAtom: any; remove: any }) @{
	const [todo, setTodo] = useAtom(props.todoAtom);
	<li>
		<span
			id={'t-' + todo.id}
			class={todo.done ? 'done' : 'todo'}
			onClick={() => setTodo({ ...todo, done: !todo.done })}
		>{todo.text as string}</span>
		<button id={'rm-' + todo.id} onClick={props.remove}>x</button>
	</li>
}

export function Todos() @{
	const [todoAtoms, dispatch] = useAtom(todoAtomsAtom);
	const setTodos = useSetAtom(todosAtom);
	<div>
		<ul>
			@for (const todoAtom of todoAtoms; key String(todoAtom)) {
				<Todo todoAtom={todoAtom} remove={() => dispatch({ type: 'remove', atom: todoAtom })} />
			}
		</ul>
		<button
			id="add"
			onClick={() => {
				const id = nextId;
				nextId += 1;
				setTodos((prev) => [...prev, { id, text: 'todo' + id, done: false }]);
			}}
		>
			add
		</button>
	</div>
}
