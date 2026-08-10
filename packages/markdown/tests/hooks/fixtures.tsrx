import { MarkdownHooks } from '../../src/index';
import type { HooksOptions } from '../../src/types';

export function HooksErrorBoundary(props: { options: HooksOptions }) @{
	@try {
		<MarkdownHooks {...props.options} />
	} @catch (error) {
		<output data-testid="hooks-error">{(error as Error).message as string}</output>
	}
}
