#!/usr/bin/env node
import { verifyVaulUpstream } from '../scripts/verify-upstream.mjs';

const result = verifyVaulUpstream();
console.log(`vaul upstream evidence verified (${result.files} files)`);
