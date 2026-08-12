import type { Key } from '../_internal/index.js';
import { serialize } from '../_internal/utils/serialize.js';

export const unstable_serialize = (key: Key) => serialize(key)[0];
