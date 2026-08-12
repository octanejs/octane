import React, { memo, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import styled from "styled-components"
import { visit } from "unist-util-visit"
import rehypeKatex from "rehype-katex"
import rehypeRaw from "rehype-raw"
import remarkMath from "remark-math"
import remarkGfm from "remark-gfm"

import { vscode } from "@src/utils/vscode"

import CodeBlock from "./CodeBlock"
import MermaidBlock from "./MermaidBlock"

interface MarkdownBlockProps {
	markdown?: string
}

const StyledMarkdown = styled.div`
	* {
		font-weight: 400;
	}

	strong {
		font-weight: 600;
	}

	code:not(pre > code) {
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 0.85em;
		filter: saturation(110%) brightness(95%);
		color: var(--vscode-textPreformat-foreground) !important;
		background-color: var(--vscode-textPreformat-background) !important;
		padding: 1px 2px;
		white-space: pre-line;
		word-break: break-word;
		overflow-wrap: anywhere;
	}

	/* Target only Dark High Contrast theme using the data attribute VS Code adds to the body */
	body[data-vscode-theme-kind="vscode-high-contrast"] & code:not(pre > code) {
		color: var(
			--vscode-editorInlayHint-foreground,
			var(--vscode-symbolIcon-stringForeground, var(--vscode-charts-orange, #e9a700))
		);
	}

	/* KaTeX styling */
	.katex {
		font-size: 1.1em;
		color: var(--vscode-editor-foreground);
		font-family: KaTeX_Main, "Times New Roman", serif;
		line-height: 1.2;
		white-space: normal;
		text-indent: 0;
	}

	.katex-display {
		display: block;
		margin: 1em 0;
		text-align: center;
		padding: 0.5em;
		overflow-x: auto;
		overflow-y: hidden;
		background-color: var(--vscode-textCodeBlock-background);
		border-radius: 3px;
	}

	.katex-error {
		color: var(--vscode-errorForeground);
	}

	font-family:
		var(--vscode-font-family),
		system-ui,
		-apple-system,
		BlinkMacSystemFont,
		"Segoe UI",
		Roboto,
		Oxygen,
		Ubuntu,
		Cantarell,
		"Open Sans",
		"Helvetica Neue",
		sans-serif;

	font-size: var(--vscode-font-size, 13px);

	p,
	li,
	ol,
	ul {
		line-height: 1.35em;
	}

	li {
		margin: 0.5em 0;
	}

	ol,
	ul {
		padding-left: 2em;
		margin-left: 0;
	}

	ol {
		list-style-type: decimal;
	}

	ul {
		list-style-type: disc;
	}

	ol ol {
		list-style-type: lower-alpha;
	}

	ol ol ol {
		list-style-type: lower-roman;
	}

	p {
		white-space: pre-wrap;
		margin: 1em 0 0.25em;
	}

	/* Prevent layout shifts during streaming */
	pre {
		min-height: 3em;
		transition: height 0.2s ease-out;
	}

	/* Code block container styling */
	div:has(> pre) {
		position: relative;
		contain: layout style;
		padding: 0.5em 1em;
	}

	a {
		color: var(--vscode-textLink-foreground);
		text-decoration: none;
		text-decoration-color: var(--vscode-textLink-foreground);
		&:hover {
			color: var(--vscode-textLink-activeForeground);
			text-decoration: underline;
		}
	}

	h1 {
		font-size: 1.65em;
		font-weight: 700;
		margin: 1.35em 0 0.5em;
	}

	h2 {
		font-size: 1.35em;
		font-weight: 500;
		margin: 1.35em 0 0.5em;
	}

	h3 {
		font-size: 1.2em;
		font-weight: 500;
	}

	/* Table styles for remark-gfm */
	table {
		border-collapse: collapse;
		margin: 1em 0;
		width: auto;
		min-width: 50%;
		max-width: 100%;
		table-layout: fixed;
	}

	/* Table wrapper for horizontal scrolling */
	.table-wrapper {
		overflow-x: auto;
		margin: 1em 0;
	}

	th,
	td {
		border: 1px solid var(--vscode-panel-border);
		padding: 8px 12px;
		text-align: left;
		word-wrap: break-word;
		overflow-wrap: break-word;
	}

	th {
		background-color: var(--vscode-editor-background);
		font-weight: 600;
		color: var(--vscode-foreground);
	}

	tr:nth-child(even) {
		background-color: var(--vscode-editor-inactiveSelectionBackground);
	}

	tr:hover {
		background-color: var(--vscode-list-hoverBackground);
	}
`

const MarkdownBlock = memo(({ markdown }: MarkdownBlockProps) => {
	// Allow local-file and VS Code command links in addition to the default
	// web protocols. ReactMarkdown's defaultUrlTransform and rehype-sanitize
	// both filter URL protocols, so we need to extend both. The click handler
	// in `components.a` is what actually routes these hrefs safely.
	const allowedProtocols = useMemo(() => /^(https?|ircs?|mailto|xmpp|file|command|vscode|vscode-resource)$/i, [])

	const sanitizeSchema = useMemo(() => {
		const protocols = defaultSchema?.protocols?.href ?? []
		const extendedProtocols = Array.from(new Set([...protocols, "file", "command", "vscode", "vscode-resource"]))
		return {
			...defaultSchema,
			protocols: {
				...defaultSchema?.protocols,
				href: extendedProtocols,
			},
		}
	}, [])

	// Custom urlTransform: keep relative URLs and any URL whose protocol is in
	// the allow list; drop everything else (e.g. javascript:, data:).
	const urlTransform = useMemo(
		() => (url: string) => {
			const colon = url.indexOf(":")
			const questionMark = url.indexOf("?")
			const numberSign = url.indexOf("#")
			const slash = url.indexOf("/")

			if (
				colon === -1 ||
				(slash !== -1 && colon > slash) ||
				(questionMark !== -1 && colon > questionMark) ||
				(numberSign !== -1 && colon > numberSign) ||
				allowedProtocols.test(url.slice(0, colon))
			) {
				return url
			}
			return ""
		},
		[allowedProtocols],
	)

	const components = useMemo(
		() => ({
			table: ({ children, ...props }: any) => {
				return (
					<div className="table-wrapper">
						<table {...props}>{children}</table>
					</div>
				)
			},
			a: ({ href, children, ...props }: any) => {
				const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
					if (!href) {
						return
					}

					// Allow modifier-click (cmd/ctrl/middle-click) to fall through to the
					// browser/webview default so users can still "open in new tab" if supported.
					const wantsDefault = e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1
					if (wantsDefault) {
						return
					}

					// ALWAYS swallow the native navigation. Without this, the webview's <base href>
					// (the asWebviewUri cdn URL) gets prepended to any href, producing
					// https://file+.vscode-resource.vscode-cdn.net/.../<href> and the system browser
					// ends up handling it.
					e.preventDefault()
					e.stopPropagation()

					// Classify the href and dispatch to the right host handler.
					// 1) In-page anchor: let the browser do its default scroll.
					if (href.startsWith("#")) {
						return
					}

					// 2) External resources (http/https/mailto/etc): open via the host so we never
					//    hit the <base href> pollution and the system browser is used explicitly.
					if (/^(https?|mailto|tel|ftp|vscode|vscode-resource):/i.test(href)) {
						vscode.postMessage({ type: "openExternal", url: href })
						return
					}

					// 3) VS Code command links: dispatch via the host's executeCommand, since
					//    vscode.env.openExternal does not reliably handle the command: scheme.
					if (href.startsWith("command:")) {
						vscode.postMessage({ type: "executeCommand", command: href.slice("command:".length) })
						return
					}

					// 4) Everything else is treated as a local file path (file://, absolute, or relative).
					//    Normalize to something the host's openFile() understands.
					let filePath = href.replace(/^file:\/\//, "")

					// Extract line number if present (e.g. path/to/file.ts:123 or file:///x.ts:123-145)
					const match = filePath.match(/(.*):(\d+)(-\d+)?$/)
					let values = undefined
					if (match) {
						filePath = match[1]
						values = { line: parseInt(match[2]) }
					}

					// Add ./ prefix if it's a bare relative path (no leading / or ./).
					if (!filePath.startsWith("/") && !filePath.startsWith("./")) {
						filePath = "./" + filePath
					}

					vscode.postMessage({
						type: "openFile",
						text: filePath,
						values,
					})
				}

				return (
					<a {...props} href={href} onClick={handleClick}>
						{children}
					</a>
				)
			},
			pre: ({ children, ..._props }: any) => {
				// The structure from react-markdown v9 is: pre > code > text
				const codeEl = children as React.ReactElement

				if (!codeEl || !codeEl.props) {
					return <pre>{children}</pre>
				}

				const { className = "", children: codeChildren } = codeEl.props

				// Get the actual code text
				let codeString = ""
				if (typeof codeChildren === "string") {
					codeString = codeChildren
				} else if (Array.isArray(codeChildren)) {
					codeString = codeChildren.filter((child) => typeof child === "string").join("")
				}

				// Handle mermaid diagrams
				if (className.includes("language-mermaid")) {
					return (
						<div style={{ margin: "1em 0" }}>
							<MermaidBlock code={codeString} />
						</div>
					)
				}

				// Extract language from className
				const match = /language-(\w+)/.exec(className)
				const language = match ? match[1] : "text"

				// Wrap CodeBlock in a div to ensure proper separation
				return (
					<div style={{ margin: "1em 0" }}>
						<CodeBlock source={codeString} language={language} />
					</div>
				)
			},
			code: ({ children, className, ...props }: any) => {
				// This handles inline code
				return (
					<code className={className} {...props}>
						{children}
					</code>
				)
			},
		}),
		[],
	)

	try {
		return (
			<StyledMarkdown>
				<ReactMarkdown
					remarkPlugins={[
						remarkGfm,
						remarkMath,
						() => {
							return (tree: any) => {
								visit(tree, "code", (node: any) => {
									if (!node.lang) {
										node.lang = "text"
									} else if (node.lang.includes(".")) {
										node.lang = node.lang.split(".").slice(-1)[0]
									}
								})
							}
						},
					]}
					rehypePlugins={[rehypeRaw, rehypeKatex as any, [rehypeSanitize, sanitizeSchema]]}
					urlTransform={urlTransform}
					components={components}>
					{markdown || ""}
				</ReactMarkdown>
			</StyledMarkdown>
		)
	} catch (error) {
		console.error("Markdown render failed, fallback to text:", error)
		return <pre style={{ whiteSpace: "pre-wrap" }}>{safePlainText(markdown || "")}</pre>
	}
})

export default MarkdownBlock

function safePlainText(str: string) {
	return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;")
}
