const serializer = require('@emotion/jest/serializer');

module.exports = {
	test: serializer.test,
	serialize(value, config, indentation, depth, refs, printer) {
		return serializer
			.serialize(value, config, indentation, depth, refs, printer)
			.replace(
				/^(\s*)display: flex;$/gm,
				'$1display: -webkit-box;\n$1display: -webkit-flex;\n$1display: -ms-flexbox;\n$1display: flex;',
			);
	},
};
