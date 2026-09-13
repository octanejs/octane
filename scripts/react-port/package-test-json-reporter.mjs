import { JsonReporter } from 'vitest/node';

export default class PackageTestJsonReporter extends JsonReporter {
	constructor() {
		const outputFile = process.env.REACT_PORT_VITEST_REPORT_FILE;
		if (!outputFile) throw new Error('Package test evidence requires its own report file');
		// A package's custom reporter may use the global outputFile. Give this
		// reporter an explicit path so the two writers cannot corrupt either file.
		super({ outputFile });
	}
}
