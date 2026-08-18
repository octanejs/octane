#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, verifyManifestFiles } from './harness-lib.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = await loadManifest(path.join(repo, 'packages/input-otp/audit/react-parity.json'));
await verifyManifestFiles(manifest, repo);
console.log(
	`input-otp parity evidence is internally consistent (${manifest.provenance.verification}).`,
);
