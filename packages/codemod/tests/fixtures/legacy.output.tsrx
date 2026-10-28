import type { OctaneNode, ChangeEvent } from 'octane';
import { Component } from 'react';

type State = { hasError: boolean };

export class Boundary extends Component<{ children: OctaneNode }, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? <p>Oops</p> : this.props.children;
  }
}

export function Search({ onSearch }: { onSearch: (q: string) => void }) @{
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onSearch(event.currentTarget.value);
  }
  <input type="search" onInput={handleChange} />
}
