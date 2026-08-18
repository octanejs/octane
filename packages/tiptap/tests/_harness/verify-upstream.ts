/**
 * Fail closed before the pristine TipTap suite runs if vendored upstream bytes
 * drift from packages/tiptap/upstream/SHA256SUMS.
 */
// @ts-expect-error plain ESM verifier without declaration emit
import { verifyTiptapUpstream } from '../../scripts/verify-upstream.mjs';

verifyTiptapUpstream();
