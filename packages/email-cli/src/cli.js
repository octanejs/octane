#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { exportTemplates } from './export.js';
import { startPreviewServer } from './preview/server.js';

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		dir: { type: 'string', short: 'd', default: './emails' },
		outDir: { type: 'string', default: './out' },
		extension: { type: 'string', short: 'e' },
		pretty: { type: 'boolean', short: 'p', default: false },
		port: { type: 'string', default: '3000' },
		host: { type: 'string', default: '127.0.0.1' },
		help: { type: 'boolean', short: 'h', default: false },
	},
});

const command = positionals[0];

if (values.help || (command !== 'export' && command !== 'dev')) {
	console.log(`Usage: octane-email <dev|export> [options]

Options:
  -d, --dir <path>          email templates directory (default: ./emails)
	  --host <host>         preview host (default: 127.0.0.1)
	  --port <port>         preview port (default: 3000)
      --outDir <path>       rendered output directory (default: ./out)
  -e, --extension <suffix>  rendered file extension (default: html)
  -p, --pretty              format rendered markup`);
	process.exitCode = values.help ? 0 : 1;
} else if (command === 'export') {
	try {
		const result = await exportTemplates(values.outDir, values.dir, {
			extension: values.extension,
			pretty: values.pretty,
		});
		console.log(
			`Exported ${result.templates.length} email${result.templates.length === 1 ? '' : 's'} to ${result.outputDirectory}`,
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
} else {
	try {
		const port = Number(values.port);
		if (!Number.isInteger(port) || port < 0 || port > 65_535) {
			throw new Error(`Invalid port: ${values.port}`);
		}
		const server = await startPreviewServer({ directory: values.dir, host: values.host, port });
		console.log(`Octane email preview available at ${server.url}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
