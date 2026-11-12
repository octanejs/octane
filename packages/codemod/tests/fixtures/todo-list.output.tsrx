import { type FC, useState, useMemo } from 'octane';

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

export const TodoList: FC<{ todos: Todo[]; onToggle: (id: string) => void }> = ({ todos, onToggle }) => @{
  const [filter, setFilter] = useState('');
  const visible = useMemo(
    () => todos.filter((todo) => todo.title.includes(filter)),
    [todos, filter],
  );

  <section>
    <input
      value={filter}
      onInput={(e) => setFilter(e.currentTarget.value)}
      placeholder="Filter"
    />
    @if (visible.length === 0) { <p class="empty">Nothing to do</p> } @else {
      <ul>
        {visible.map((todo, index) => (
          <li key={todo.id} className={todo.done ? 'done' : undefined}>
            <label htmlFor={`todo-${todo.id}`}>
              {index + 1}. {todo.title}
            </label>
            <input
              id={`todo-${todo.id}`}
              type="checkbox"
              checked={todo.done}
              onChange={() => onToggle(todo.id)}
            />
          </li>
        ))}
      </ul>
    }
  </section>
};
