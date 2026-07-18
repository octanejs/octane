//#region src/start-compiler/handleClientOnlyJSX.ts
/**
* Handles <ClientOnly> JSX elements on the server side.
*
* On the server, the children of <ClientOnly> should be removed since they
* are client-only code. Only the fallback prop (if present) will be rendered.
*
* Transform:
*   <ClientOnly fallback={<Loading />}>{clientOnlyContent}</ClientOnly>
* Into:
*   <ClientOnly fallback={<Loading />} />
*
* Or if no fallback:
*   <ClientOnly>{clientOnlyContent}</ClientOnly>
* Into:
*   <ClientOnly />
*/
function handleClientOnlyJSX(path, _opts) {
	const element = path.node;
	element.children = [];
	element.openingElement.selfClosing = true;
	element.closingElement = null;
}
//#endregion
export { handleClientOnlyJSX };

//# sourceMappingURL=handleClientOnlyJSX.js.map