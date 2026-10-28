import React, { useState, useEffect } from 'react';

type Props = { initial?: number; label: string };

export default function Counter({ initial = 0, label }: Props) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    document.title = `${label}: ${count}`;
  });

  return (
    <div className="counter">
      <span>{label}</span>
      <button onClick={() => setCount((c) => c + 1)}>+</button>
      {count > 10 && <strong>Big!</strong>}
      {count === 0 ? <em>zero</em> : <span>{count}</span>}
    </div>
  );
}
