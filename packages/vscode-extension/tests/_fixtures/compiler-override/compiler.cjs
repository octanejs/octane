'use strict';

exports.compileToVolarMappings = (source) => ({
	code: `/* configured compiler */\n${source}`,
	mappings: [],
});
