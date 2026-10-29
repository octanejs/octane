import { useEffect, type MouseEvent as OctaneMouseEvent } from 'octane';
import { Tooltip } from '@octanejs/radix';

// A local helper that shadows nothing at module scope but is named like a hook.
function useLocalState(useEffect: (fn: () => void) => void) {
  // This `useEffect` is the parameter, not React's: it keeps its call shape.
  useEffect(() => {});
}

export function Notes({ notes, items, html }: { notes: string[]; items: string[][]; html: string }) @{
  useEffect(() => {
    const React = { useState: () => 0 };
    // The shadowing `React` is not the namespace import.
    console.log(React.useState());
  }, null);

  const handle = (e: OctaneMouseEvent<HTMLButtonElement>) => {
    const inner = (e: { nativeEvent: string }) => e.nativeEvent;
    console.log(inner({ nativeEvent: 'kept' }), e);
    // The DOM's own MouseEvent, which an Octane `MouseEvent` import would shadow.
    e.currentTarget.dispatchEvent(new MouseEvent('focus'));
  };

  // The list of notes.
  <Tooltip.Provider>
    <button onClick={handle}>Log</button>
    {/* Only shown with notes. */}
    @if (notes.length > 0) { <p>{String(notes.length)}</p> }
    {/* Rendered as preformatted text. */}
    @if (notes.length > 0) {
      <pre title={`first line
  second line`}>{html as string}</pre>
    }
    {items.map((items) => <span key={items.join()}>{items}</span>)}
    {notes.map(function (note) {
      return <i key={note}>{this === undefined ? note : ''}</i>;
    })}
  </Tooltip.Provider>
}
