/** @jsxImportSource @octanejs/ink/intrinsics */
import { useEffect, type UniversalRenderable } from 'octane/universal/native';
import ErrorOverview from './ErrorOverview.ink.tsrx';

type Props = {
	readonly children: UniversalRenderable;
	readonly onError: (error: Error) => void;
};

function BoundaryChildren({
	children,
}: {
	readonly children: UniversalRenderable;
}): UniversalRenderable {
	return children;
}

function ErrorFallback({ error, onError }: { error: Error; onError: (error: Error) => void }) @{
	useEffect(() => onError(error), [error, onError]);
	<ErrorOverview error={error} />
}

export default function ErrorBoundary({ children, onError }: Props) @{
	@try {
		<BoundaryChildren>{children}</BoundaryChildren>
	} @catch (error) {
		<ErrorFallback error={error as Error} onError={onError} />
	}
}
