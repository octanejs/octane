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
}) @{
  <section>
    <h2>{title as string}</h2>
    <p>
      {size as string}, {String(count)} of {String(total)}
    </p>
    <p>{String(count + 1)} rows</p>
    <p>{(open ? title : 'closed') as string}</p>
    <p>{title.toUpperCase() as string}</p>
    {/* Already text, or not provably text: left as written. */}
    <p>{'Total: ' + total}</p>
    <p>{title as string}</p>
    <p>{rows[0]?.label}</p>
    <p>{flag}</p>
    <ul>
      @for (const row of rows; key row.id) {
        <li>
          {String(row.id)}: {row.label as string} {row.note}
        </li>
      }
    </ul>
  </section>
}
