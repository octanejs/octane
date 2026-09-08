import { useCallback } from 'octane';

import type { UseReactToPrintHookContent } from '../types/UseReactToPrintHookContent';
import type { UseReactToPrintFn } from '../types/UseReactToPrintFn';
import type { UseReactToPrintOptions } from '../types/UseReactToPrintOptions';
import { appendPrintWindow } from '../utils/appendPrintWindow';
import { generatePrintWindow } from '../utils/generatePrintWindow';
import { getErrorFromUnknown } from '../utils/getErrorMessage';
import { getPrintData } from '../utils/getPrintData';
import { logMessages } from '../utils/logMessage';
import { removePrintIframe } from '../utils/removePrintIframe';

export function useReactToPrint(options?: UseReactToPrintOptions): UseReactToPrintFn;
export function useReactToPrint(
	options: UseReactToPrintOptions | symbol = {},
	...rest: [slot?: symbol]
): UseReactToPrintFn {
	const slot = typeof options === 'symbol' ? options : rest[0];
	const resolved = typeof options === 'symbol' ? ({} as UseReactToPrintOptions) : options;
	const {
		bodyClass,
		contentRef,
		copyShadowRoots,
		documentTitle,
		fonts,
		ignoreGlobalStyles,
		nonce,
		onAfterPrint,
		onBeforePrint,
		onPrintError,
		pageStyle,
		preserveAfterPrint,
		print,
		printIframeProps,
		suppressErrors,
	} = resolved;

	const handlePrint = useCallback(
		function handlePrint(optionalContent?: UseReactToPrintHookContent) {
			// Ensure we remove any pre-existing print windows before adding a new one.
			removePrintIframe(preserveAfterPrint, true);

			function beginPrint() {
				const printOptions: UseReactToPrintOptions = {
					bodyClass,
					contentRef,
					copyShadowRoots,
					documentTitle,
					fonts,
					ignoreGlobalStyles,
					nonce,
					onAfterPrint,
					onBeforePrint,
					onPrintError,
					pageStyle,
					preserveAfterPrint,
					print,
					printIframeProps,
					suppressErrors,
				};

				const printWindow = generatePrintWindow(printIframeProps);
				const data = getPrintData(optionalContent, printOptions);

				if (!data) {
					logMessages({
						messages: ['There is nothing to print'],
						suppressErrors,
					});
					return;
				}

				appendPrintWindow(printWindow, data, printOptions);
			}

			// Run onBeforePrint before appending the iframe, which begins loading
			// the resources required by the print document.
			if (onBeforePrint) {
				onBeforePrint()
					.then(function onBeforePrintResolved() {
						beginPrint();
					})
					.catch(function onBeforePrintRejected(error: unknown) {
						onPrintError?.('onBeforePrint', getErrorFromUnknown(error));
					});
			} else {
				beginPrint();
			}
		},
		[
			bodyClass,
			contentRef,
			copyShadowRoots,
			documentTitle,
			fonts,
			ignoreGlobalStyles,
			nonce,
			onAfterPrint,
			onBeforePrint,
			onPrintError,
			pageStyle,
			preserveAfterPrint,
			printIframeProps,
			print,
			suppressErrors,
		],
		slot,
	);

	return handlePrint;
}
