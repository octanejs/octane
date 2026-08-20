#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyHookFormUpstream } from './hook-form-upstream-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const result = verifyHookFormUpstream(root);
console.log(
	`react-hook-form upstream evidence is current (${result.artifacts} artifacts, ${result.upstreamCases} upstream registrations, ${result.portedCases} adapted registrations).`,
);
