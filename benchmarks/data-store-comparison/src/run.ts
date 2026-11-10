import { readFileSync } from 'node:fs';
import { cachedDesign } from './cached.ts';
import { normalizedDesign } from './normalized/design.ts';
import { JOURNEYS, runColdStart, runJourney, type Result } from './journeys.ts';
import { LATENCY_MS } from './library.ts';

const designs = [cachedDesign, normalizedDesign];
const sizes = (process.env.SIZES ?? '2000,20000').split(',').map(Number);

/** Non-blank lines between the FEATURE markers in a source file. */
function featureLines(file: string): number {
	const source = readFileSync(new URL(file, import.meta.url), 'utf8');
	const body = source.slice(source.indexOf('FEATURE START'), source.indexOf('FEATURE END'));
	return body.split('\n').filter((line) => line.trim() && !line.trim().startsWith('//')).length - 1;
}

const ms = (value: number | null) => (value === null ? 'never' : `${value}`);
const kb = (value: number) => (value / 1024).toFixed(1);

console.log(`Network latency per hop: ${LATENCY_MS} ms\n`);
for (const count of sizes) {
	console.log(`## ${count.toLocaleString('en')} books\n`);
	console.log(
		'| Journey | Design | Intended state shown (ms) | Settled correctly | Requests | KB fetched | KB across worker | Impossible states |',
	);
	console.log('| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |');
	for (const journey of JOURNEYS) {
		for (const factory of designs) {
			const result: Result = await runJourney(factory, journey, count);
			console.log(
				`| ${result.journey} | ${result.design} | ${ms(result.intendedMs)} | ${result.settled ? 'yes' : 'no'} | ${result.requests} | ${kb(result.bytesFetched)} | ${kb(result.workerBytes)} | ${result.violations} |`,
			);
		}
	}
	console.log(
		'\n| 5. Cold start | First load (ms) | Requests | KB fetched | KB across worker | KB persisted | Restore (ms) | Restore requests | Restored views correct |',
	);
	console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
	for (const factory of designs) {
		const result = await runColdStart(factory, count);
		console.log(
			`| ${result.design} | ${result.networkLoadMs} | ${result.networkLoadRequests} | ${kb(result.networkLoadBytes)} | ${kb(result.networkLoadWorkerBytes)} | ${kb(result.persistedBytes)} | ${result.restoreMs} | ${result.restoreRequests} | ${result.restoredViewsCorrect ? 'yes' : 'no'} |`,
		);
	}
	console.log('');
}
console.log(
	`Feature code: A ${featureLines('../src/cached.ts')} lines; B ${featureLines('../src/library.ts')} lines.`,
);
process.exit(0);
