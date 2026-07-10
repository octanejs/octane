// Vendored from react-hook-form@7.81.0 src/utils/live.ts (octane port).
import type { Ref } from '../types';

import isHTMLElement from './isHTMLElement';

export default (ref: Ref) => isHTMLElement(ref) && ref.isConnected;
