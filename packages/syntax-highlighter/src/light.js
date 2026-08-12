import highlight from "./highlight.js";
import lowlight from "lowlight/lib/core.js";

const SyntaxHighlighter = highlight(lowlight, {});
SyntaxHighlighter.registerLanguage = lowlight.registerLanguage;

export default SyntaxHighlighter;
