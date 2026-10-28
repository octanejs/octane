import React, { Component } from 'react';

type State = { hasError: boolean };

export class Boundary extends Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? <p>Oops</p> : this.props.children;
  }
}

export function Search({ onSearch }: { onSearch: (q: string) => void }) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    event.persist();
    onSearch(event.target.value);
  }
  return <input type="search" onChange={handleChange} />;
}
