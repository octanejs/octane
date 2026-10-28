import React, { StrictMode, Suspense, lazy } from 'react';
import ReactDOM from 'react-dom';

const Page = lazy(() => import('./Page'));

function App() {
  return (
    <Suspense fallback={<div className="spinner">Loading…</div>}>
      <Page />
    </Suspense>
  );
}

ReactDOM.render(
  <StrictMode>
    <App />
  </StrictMode>,
  document.getElementById('root'),
);
