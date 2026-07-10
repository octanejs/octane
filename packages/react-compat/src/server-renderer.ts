const unsupported = (name: string): never => {
	throw new Error(
		`[react-compat] ReactDOMServer.${name} is not supported. ` +
			'Use await render(Component, props) from octane/server; React dependencies inside that tree are supported.',
	);
};

export function renderToString(): never {
	return unsupported('renderToString');
}
export function renderToStaticMarkup(): never {
	return unsupported('renderToStaticMarkup');
}
export function renderToPipeableStream(): never {
	return unsupported('renderToPipeableStream');
}
export function renderToReadableStream(): never {
	return unsupported('renderToReadableStream');
}
export function resume(): never {
	return unsupported('resume');
}
export function resumeToPipeableStream(): never {
	return unsupported('resumeToPipeableStream');
}

export const version = '19.2.0-octane-compat';
