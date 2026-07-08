// Vendored verbatim from recharts@3.9.2 es6/animation/util.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
/*
 * @description: convert camel case to dash case
 * string => string
 */
export var getDashCase = (name) => name.replace(/([A-Z])/g, (v) => '-'.concat(v.toLowerCase()));
export var getTransitionVal = (props, duration, easing) =>
	props
		.map((prop) => ''.concat(getDashCase(prop), ' ').concat(duration, 'ms ').concat(easing))
		.join(',');
