/**
 * StyleX's final native props contain class names, inline values, and optional
 * debug metadata. CSS rules belong to the separately extracted stylesheet.
 * @type {readonly import('octane/compiler').KnownAttributeSpread[]}
 */
export const knownAttributeSpreads = [
	{
		source: '@octanejs/stylex',
		imported: 'props',
		fields: ['className', 'style', 'data-style-src'],
		style: 'object',
		jsxAttribute: 'sx',
	},
];
