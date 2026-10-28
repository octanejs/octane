import { memo, useImperativeHandle, useRef, type Ref } from 'octane';

type Item = { id: string; label: string; hidden?: boolean; children?: Item[] };

export const Tree = memo(function Tree({ items, status }: { items: Item[]; status: 'idle' | 'loading' | 'error' }) @{
  if (status === 'error') return <p role="alert">Failed</p>;

  <div>
    @if (status === 'loading') { <span>Loading…</span> } @else {
      @if (items.length === 0) { <span>Empty</span> } @else {
        <ul>
          @for (const item of items; key item.id) {
            if (item.hidden) return null;
            const label = item.label.toUpperCase();
            <li>
              {label}
              @if (item.children) { <Tree items={item.children} status="idle" /> }
            </li>
          }
        </ul>
      }
    }
    @for (const item of items; key item.id) {
      <>
        <dt>{item.label}</dt>
        <dd>{item.id}</dd>
      </>
    }
  </div>
});

export function Field({ ref, onCommit }: { ref?: Ref<{ focus(): void }>; onCommit: (value: string) => void }) @{
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), null);
  <textarea
    ref={input}
    onInput={(event) => onCommit(event.currentTarget.value)}
    onKeyDown={(event) => {
      if (event.isComposing) return;
    }}
  />
}
