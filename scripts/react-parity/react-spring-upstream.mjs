#!/usr/bin/env node
import { resolve } from 'node:path';
import { verifyReactSpringUpstream } from './react-spring-upstream-lib.mjs';

const result = verifyReactSpringUpstream(resolve(import.meta.dirname, '../..'));
console.log(
	`React Spring v10.1.2 upstream evidence is current (${result.files} byte-exact files; ${result.caseDispositions} case dispositions; ${result.pristineCases} pristine / ${result.adaptedCases} adapted identities; inventory ${result.checksum}).`,
);
