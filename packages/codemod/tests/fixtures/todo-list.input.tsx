import * as React from 'react';

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

export const TodoList: React.FC<{ todos: Todo[]; onToggle: (id: string) => void }> = ({ todos, onToggle }) => {
  const [filter, setFilter] = React.useState('');
  const visible = React.useMemo(
    () => todos.filter((todo) => todo.title.includes(filter)),
    [todos, filter],
  );

  return (
    <section>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter"
      />
      {visible.length === 0 ? (
        <p className="empty">Nothing to do</p>
      ) : (
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
      )}
    </section>
  );
};
