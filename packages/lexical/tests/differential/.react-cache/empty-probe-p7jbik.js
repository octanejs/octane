import { jsx, jsxs } from "react/jsx-runtime";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalIsTextContentEmpty } from "@lexical/react/useLexicalIsTextContentEmpty";
import { useEffect } from "react";
function Probe(props) {
  const [editor] = useLexicalComposerContext();
  const isEmpty = useLexicalIsTextContentEmpty(editor);
  useEffect(
    () => {
      props.onState(editor, isEmpty);
    },
    [isEmpty]
  );
  return null;
}
function EmptyProbeEditor(props) {
  return /* @__PURE__ */ jsxs(LexicalComposer, { initialConfig: {
    namespace: "octane-empty",
    onError: (error) => {
      throw error;
    }
  }, children: [
    /* @__PURE__ */ jsx(RichTextPlugin, { contentEditable: /* @__PURE__ */ jsx(ContentEditable, {}), ErrorBoundary: LexicalErrorBoundary }),
    /* @__PURE__ */ jsx(Probe, { onState: props.onState })
  ] });
}
export {
  EmptyProbeEditor
};
