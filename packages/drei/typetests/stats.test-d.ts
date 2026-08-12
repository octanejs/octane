import { Stats, StatsGl, type StatsGlProps, type StatsProps } from '../src/index.js';

const stats: StatsProps = { showPanel: 1, className: 'perf' };
const statsGl: StatsGlProps = { showPanel: 2, logsPerSecond: 10, id: 'stats' };
Stats;
StatsGl;
stats;
statsGl;

// @ts-expect-error panel is numeric
const invalidPanel: StatsProps = { showPanel: 'fps' };
// @ts-expect-error clear style flag is boolean
const invalidClear: StatsGlProps = { clearStatsGlStyle: 'yes' };
