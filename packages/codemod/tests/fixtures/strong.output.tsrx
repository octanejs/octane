import { useEffect, useRef, useState } from 'octane';

type Props = { userId: string; initialCount: number; rows: { id: number; name: string }[] };

export function Profile({ userId, initialCount, rows }: Props) @{
  const [count, setCount] = useState(initialCount);
  const cache = useRef<Map<string, string> | null>(null);
  if (cache.current === null) cache.current = new Map();

  useEffect(() => {
    console.log('viewing', userId);
  }, [userId]);

  <section>
    <button onClick={() => setCount((value) => value + 1)}>{count}</button>
    <ul>
      @for (const {id, name} of [...rows]; key id) { <li>{name as string}</li> }
    </ul>
  </section>
}
