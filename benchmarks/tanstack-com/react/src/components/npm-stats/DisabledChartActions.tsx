import { Download, List } from 'lucide-react';
import { Tooltip } from '~/components/Tooltip';

const disabledChartActionButtonStyles =
	'flex size-6 cursor-not-allowed items-center justify-center rounded bg-gray-500/10 text-gray-600 opacity-50 dark:text-gray-400';

export function DisabledChartActions() {
	return (
		<div className="flex items-center gap-1">
			<Tooltip content="Chart export available after render">
				<button
					aria-label="Export chart"
					className={disabledChartActionButtonStyles}
					disabled={true}
					type="button"
				>
					<Download className="size-3" />
				</button>
			</Tooltip>
			<Tooltip content="Plot legend available after render">
				<button
					aria-label="Show Plot legend"
					aria-pressed={false}
					className={disabledChartActionButtonStyles}
					disabled={true}
					type="button"
				>
					<List className="size-3" />
				</button>
			</Tooltip>
		</div>
	);
}
