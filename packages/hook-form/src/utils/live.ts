// Adapted from react-hook-form@7.88.0 src/utils/live.ts for Octane.
import type { Ref } from '../types';

import isHTMLElement from './isHTMLElement';

export default (ref: Ref) => isHTMLElement(ref) && ref.isConnected;
