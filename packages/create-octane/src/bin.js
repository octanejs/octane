#!/usr/bin/env node
import { create } from './create.js';

process.exitCode = await create(process.argv.slice(2));
