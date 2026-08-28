export const NATIVE_SIGNAL_NAME = 'OCTANE_NATIVE_SIGNAL_NAME';
export const NATIVE_MEMO_READ = 'OCTANE_NATIVE_MEMO_READ';

function positionAt(source, offset) {
	let line = 1;
	let column = 0;
	for (let index = 0; index < offset; index++) {
		if (source.charCodeAt(index) === 10) {
			line++;
			column = 0;
		} else column++;
	}
	return { offset, line, column };
}

export function nativeReadDiagnostic(code, source, filename, start, end, message) {
	return {
		code,
		severity: 'error',
		filename,
		message,
		start: positionAt(source, start),
		end: positionAt(source, end),
		suggestions: [],
	};
}
