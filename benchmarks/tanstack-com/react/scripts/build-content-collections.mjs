import { createBuilder } from '@content-collections/core';
import path from 'node:path';

const builder = await createBuilder(path.resolve('content-collections.ts'));
await builder.build();
