import './shell-side-effect.ts';

// This helper is needed to render the shell on the server, but the interactive
// child does not import it.
export function shellSummary(name: string) {
	return `A server-authored introduction for ${name}.`;
}
