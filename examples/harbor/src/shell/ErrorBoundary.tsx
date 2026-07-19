// A classic React class boundary around the async island. An island fault
// that escapes OctaneCompat surfaces here exactly like a React child's throw;
// "Try again" bumps the island key upstream, remounting a clean island.
import { Component, type ReactNode } from 'react';

export interface IslandErrorBoundaryProps {
	onRetry: () => void;
	children: ReactNode;
}

interface IslandErrorBoundaryState {
	error: Error | null;
}

export class IslandErrorBoundary extends Component<
	IslandErrorBoundaryProps,
	IslandErrorBoundaryState
> {
	state: IslandErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): IslandErrorBoundaryState {
		return { error };
	}

	render() {
		if (this.state.error) {
			return (
				<div className="island-fallback" role="alert">
					<p className="island-fallback-message">
						{'The recommendations ran aground: ' + this.state.error.message}
					</p>
					<button
						className="island-retry"
						onClick={() => {
							this.setState({ error: null });
							this.props.onRetry();
						}}
					>
						Try again
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}
