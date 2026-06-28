import { jsx, jsxs } from "react/jsx-runtime";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
function Capture(props) {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () => {
      props.onEditor(editor);
    },
    [editor]
  );
  return null;
}
function HrEditor(props) {
  return /* @__PURE__ */ jsxs(LexicalComposer, { initialConfig: {
    namespace: "octane-hr",
    nodes: [HorizontalRuleNode],
    onError: (error) => {
      throw error;
    }
  }, children: [
    /* @__PURE__ */ jsx(RichTextPlugin, { contentEditable: /* @__PURE__ */ jsx(ContentEditable, {}), ErrorBoundary: LexicalErrorBoundary }),
    /* @__PURE__ */ jsx(HorizontalRulePlugin, {}),
    /* @__PURE__ */ jsx(Capture, { onEditor: props.onEditor })
  ] });
}
export {
  HrEditor
};
