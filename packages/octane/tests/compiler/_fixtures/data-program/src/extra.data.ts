import { read, write } from 'octane/data';
import { schema } from './schema.ts';

export const orphan = write({ name: 'extra.orphan', input: schema<{ id: string }>() });
export const shadow = read({ name: 'books.list', output: schema<string[]>() });
