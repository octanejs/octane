// A minimal app entry for the production-build test: it imports the generated sheet
// and two styled components from SEPARATE modules, so the StyleX rules come from more
// than one file (stressing the build-time aggregation/ordering).
import 'virtual:stylex.css';
import { Box } from './Box.tsrx';
import { Pill } from './Pill.tsrx';

export const components = { Box, Pill };
