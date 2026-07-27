#!/usr/bin/env node
import { main } from '../kernel/main.js';

process.exitCode = await main(process.argv.slice(2));
