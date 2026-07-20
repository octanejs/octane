import React, { Component, ReactNode } from 'react';

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
}

export class BlankErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(_: Error): State {
		// Update state so the next render will show the fallback UI
		return { hasError: true };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		// You can log the error to an error reporting service here
		console.error('BlankErrorBoundary caught an error:', error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			// Render nothing when an error occurs
			return null;
		}

		return this.props.children;
	}
}
