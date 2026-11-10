// The browser build of `#server-document`. A client never renders the document
// elements: Html, Head, and Body take their server arm only when the router
// renders on the server.
import type * as ServerDocument from './serverDocument.tsrx';

export const ServerHtml = null as unknown as typeof ServerDocument.ServerHtml;
export const ServerHead = null as unknown as typeof ServerDocument.ServerHead;
export const ServerBody = null as unknown as typeof ServerDocument.ServerBody;
