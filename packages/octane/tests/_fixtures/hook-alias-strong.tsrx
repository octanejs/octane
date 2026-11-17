'use strong';
import { ReadingContext, useReading as readValue } from './hook-alias-source.tsrx';

function Read() @{
	const value = readValue();
	<output>{value as string}</output>
}

export function StrongReadingApp({ value }: { value: string }) @{
	<ReadingContext value={value}>
		<Read />
	</ReadingContext>
}
