import { clientOnlyServerStripTransform } from './client-only-server-strip.js';

export default function clientOnlyServerStripLoader(source) {
	const result = clientOnlyServerStripTransform(source, this.resourcePath);
	if (!result) return source;
	this.callback(null, result.code, result.map);
}
