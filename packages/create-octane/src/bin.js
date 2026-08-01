#!/usr/bin/env node
import { main } from '@octanejs/cli';

// `npm create octane my-app` arrives here as `my-app`, and the CLI dispatches
// on the first argument, so the command name has to be put in front. That is
// the whole package: the scaffold itself is `octane create`, so the two cannot
// drift into building different projects.
process.exitCode = await main(['create', ...process.argv.slice(2)]);
