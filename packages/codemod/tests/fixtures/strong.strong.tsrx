"use strong";

import { useEffect, useState, useLazyRef } from 'octane';

type Props = { userId: string; initialCount: number; rows: { id: number; name: string }[] };

export function Profile({ userId, initialCount, rows }: Props) @{
  const [count, setCount] = useState((<Input,>(initial: Input): Input => typeof initial === 'function' ? initial : (() => initial) as Input)(initialCount));
  const cache = useLazyRef(() => new Map());

  useEffect(() => {
    console.log('viewing', userId);
  });

  <section>
    <button onClick={() => setCount((value) => value + 1)}>{count}</button>
    <ul>
      @for (const {id, name} of [...rows]; key id) { <li>{name}</li> }
    </ul>
  </section>
}
