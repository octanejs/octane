import React, { memo, useImperativeHandle, useRef, Fragment } from 'react';

type Item = { id: string; label: string; hidden?: boolean; children?: Item[] };

export const Tree = memo(function Tree({ items, status }: { items: Item[]; status: 'idle' | 'loading' | 'error' }) {
  if (status === 'error') return <p role="alert">Failed</p>;

  return (
    <div>
      {status === 'loading' ? (
        <span>Loading…</span>
      ) : items.length === 0 ? (
        <span>Empty</span>
      ) : (
        <ul>
          {items.map((item) => {
            if (item.hidden) return null;
            const label = item.label.toUpperCase();
            return (
              <li key={item.id}>
                {label}
                {item.children ? <Tree items={item.children} status="idle" /> : null}
              </li>
            );
          })}
        </ul>
      )}
      {items.map((item) => (
        <React.Fragment key={item.id}>
          <dt>{item.label}</dt>
          <dd>{item.id}</dd>
        </React.Fragment>
      ))}
    </div>
  );
});

export function Field({ ref, onCommit }: { ref?: React.Ref<{ focus(): void }>; onCommit: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));
  return (
    <textarea
      ref={input}
      onChange={(event) => onCommit(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
      }}
    />
  );
}
