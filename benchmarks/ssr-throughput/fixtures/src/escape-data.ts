import { mulberry32, wordPicker } from './prng';

// 10k strings that ALL need escaping: raw `&`, `<`, `>`, `"`, `'` interleaved
// between words. `<script>` is included verbatim so an unescaped leak is
// trivially grep-detectable by the harness gate (the fixture markup itself
// never legitimately contains "<script").
export interface EscapeItem {
	id: number;
	text: string;
}

const rand = mulberry32(777);
const pick = wordPicker(rand);

export const TEXTS: EscapeItem[] = Array.from({ length: 10000 }, (_, i) => ({
	id: i + 1,
	text:
		pick() +
		' <script> ' +
		pick() +
		' & "' +
		pick() +
		'" <' +
		pick() +
		"> '" +
		pick() +
		"' && " +
		i,
}));

// Round-trip probe for the harness: the body must contain the ESCAPED form of
// this string and must not contain "<script" anywhere.
export const ESCAPE_PROBE = TEXTS[0].text;
