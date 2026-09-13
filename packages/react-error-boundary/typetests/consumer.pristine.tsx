/** @jsxImportSource react */
import type { Ref } from 'react';
import { ErrorBoundary, withErrorBoundary } from 'react-error-boundary';
const boundaryRef: { current: ErrorBoundary | null } = { current: null };
const boundary = (
	<ErrorBoundary ref={boundaryRef} fallback={null}>
		<span />
	</ErrorBoundary>
);
boundaryRef.current?.resetErrorBoundary('retry', 42);
function Input(props: { label: string; ref?: Ref<HTMLInputElement> }) {
	return <input ref={props.ref} aria-label={props.label} />;
}
const Wrapped = withErrorBoundary(Input, { fallback: null });
const elementRef = { current: null as HTMLInputElement | null };
const wrapped = <Wrapped label="name" ref={elementRef} />;
// @ts-expect-error The wrapped input retains the ref target type.
const wrongRef = <Wrapped label="name" ref={{ current: document.createElement('div') }} />;
// @ts-expect-error The wrapped component retains required props.
const missingLabel = <Wrapped ref={elementRef} />;
void [boundary, wrapped, wrongRef, missingLabel];
