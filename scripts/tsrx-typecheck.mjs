export function assertTsrxTypecheckSucceeded(result, project) {
	const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
	// The language plugin can report a parser failure without failing the
	// TypeScript process. That is not successful validation of the source file.
	if (result.error || result.status !== 0 || /^\[tsrx-tsc\]/m.test(output)) {
		const reason =
			result.error?.message ??
			result.signal ??
			(result.status === 0 ? 'parser diagnostics' : `exit ${result.status}`);
		throw new Error(`${project}: tsrx-tsc failed (${reason})${output ? `\n${output}` : ''}`);
	}
}
