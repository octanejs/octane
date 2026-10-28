interface Row {
  id: number;
  label: string;
  note?: string;
}

type Size = 'small' | 'large';

export function Rows({
  rows,
  title,
  size,
  count,
  total,
  flag,
  open,
}: {
  rows: Row[];
  title: string;
  size: Size;
  count: number;
  total: string | number;
  flag: boolean;
  open: boolean;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <p>
        {size}, {count} of {total}
      </p>
      <p>{count + 1} rows</p>
      <p>{open ? title : 'closed'}</p>
      <p>{title.toUpperCase()}</p>
      {/* Already text, or not provably text: left as written. */}
      <p>{'Total: ' + total}</p>
      <p>{title as string}</p>
      <p>{rows[0]?.label}</p>
      <p>{flag}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {row.id}: {row.label} {row.note}
          </li>
        ))}
      </ul>
    </section>
  );
}
