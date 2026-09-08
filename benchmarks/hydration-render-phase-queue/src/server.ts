import { renderToString } from 'octane/server';
import { TargetRows } from './fixture.tsrx';

export function renderCase(count: number): string {
	return renderToString(TargetRows, { count, settle: false }).html;
}
