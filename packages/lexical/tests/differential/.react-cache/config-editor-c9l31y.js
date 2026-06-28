import { jsx, jsxs } from "react/jsx-runtime";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
function Grab(props) {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () => {
      props.onEditor(editor);
    },
    [editor]
  );
  return null;
}
function renderPlaceholder(isEditable) {
  return isEditable ? /* @__PURE__ */ jsx("span", { class: "placeholder", children: "My placeholder" }) : null;
}
function ConfigEditor(props) {
  return /* @__PURE__ */ jsxs(LexicalComposer, { initialConfig: {
    namespace: "",
    theme: {},
    nodes: props.nodes,
    editorState: props.editorState,
    onError: (error) => {
      throw error;
    }
  }, children: [
    /* @__PURE__ */ jsx(Grab, { onEditor: props.onEditor }),
    props.plugin === "plain" ? /* @__PURE__ */ jsx(PlainTextPlugin, { contentEditable: /* @__PURE__ */ jsx(ContentEditable, {}), placeholder: props.withPlaceholder ? renderPlaceholder : null, ErrorBoundary: LexicalErrorBoundary }) : /* @__PURE__ */ jsx(RichTextPlugin, { contentEditable: /* @__PURE__ */ jsx(ContentEditable, {}), placeholder: props.withPlaceholder ? renderPlaceholder : null, ErrorBoundary: LexicalErrorBoundary })
  ] });
}
export {
  ConfigEditor
};
