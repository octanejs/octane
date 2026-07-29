import { Cell, Funnel, FunnelChart, Legend } from '@octanejs/recharts';
import { useAppSelector } from '@octanejs/recharts/state/hooks';
import { useLayoutEffect } from 'octane';

function FunnelTooltipSettingsProbe({ onSettings }) {
	const settings = useAppSelector((state) => state.tooltip.tooltipItemPayloads);
	useLayoutEffect(() => {
		onSettings?.(settings);
	}, [onSettings, settings]);
	return null;
}

function FunnelLegendPayload({ payload }) @{
	<div class="funnel-legend-payload">{payload.map(
		(entry) => `${entry.color}:${entry.payload.name}`,
	).sort().join('|')}</div>
}

export function HiddenFunnelRegistrationsApp({ onTooltipSettings }) @{
	<FunnelChart width={500} height={300}>
		<Legend content={FunnelLegendPayload} />
		<FunnelTooltipSettingsProbe onSettings={onTooltipSettings} />
		<Funnel
			dataKey="value"
			data={[
				{ name: 'Visitors', value: 100 },
				{ name: 'Customers', value: 60 },
			]}
			isAnimationActive={false}
			hide
		>
			<Cell fill="#ff0000" />
			<Cell fill="#0000ff" />
		</Funnel>
	</FunnelChart>
}
