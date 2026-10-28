import { useState, useEffect } from 'octane';

type Props = { initial?: number; label: string };

export default function Counter({ initial = 0, label }: Props) @{
  const [count, setCount] = useState(initial);

  useEffect(() => {
    document.title = `${label}: ${count}`;
  }, null);

  <div class="counter">
    <span>{label}</span>
    <button onClick={() => setCount((c) => c + 1)}>+</button>
    @if (count > 10) { <strong>Big!</strong> }
    @if (count === 0) { <em>zero</em> } @else { <span>{count}</span> }
  </div>
}
