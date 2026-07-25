export const RAW_STYLE_MARKER = "amp=& less=< entity=&amp; close=</style><style data-pwn='server'>";

export const RAW_STYLE_SOURCE =
	'#raw-style-target { color: rgb(1, 2, 3); }\n' +
	`#raw-style-target::before { content: "${RAW_STYLE_MARKER}"; }`;

export const UPDATED_RAW_STYLE_MARKER =
	"updated=& updated-less=< updated-entity=&lt; close=</style><style data-pwn='updated'>";

export const UPDATED_RAW_STYLE_SOURCE =
	'#raw-style-target { color: rgb(4, 5, 6); }\n' +
	`#raw-style-target::before { content: "${UPDATED_RAW_STYLE_MARKER}"; }`;
