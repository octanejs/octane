//#region src/core/code-splitter/framework-options.ts
var frameworkOptions = {
	react: {
		package: "@tanstack/react-router",
		idents: {
			createFileRoute: "createFileRoute",
			lazyFn: "lazyFn",
			lazyRouteComponent: "lazyRouteComponent"
		}
	},
	solid: {
		package: "@tanstack/solid-router",
		idents: {
			createFileRoute: "createFileRoute",
			lazyFn: "lazyFn",
			lazyRouteComponent: "lazyRouteComponent"
		}
	},
	vue: {
		package: "@tanstack/vue-router",
		idents: {
			createFileRoute: "createFileRoute",
			lazyFn: "lazyFn",
			lazyRouteComponent: "lazyRouteComponent"
		}
	},
	octane: {
		package: "@tanstack/octane-router",
		idents: {
			createFileRoute: "createFileRoute",
			lazyFn: "lazyFn",
			lazyRouteComponent: "lazyRouteComponent"
		}
	}
};
function getFrameworkOptions(framework) {
	return frameworkOptions[framework];
}
//#endregion
exports.getFrameworkOptions = getFrameworkOptions;

//# sourceMappingURL=framework-options.cjs.map