import { jsx, jsxs } from "react/jsx-runtime";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
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
function PluginsEditor(props) {
  return /* @__PURE__ */ jsxs(LexicalComposer, { initialConfig: {
    namespace: "octane-plugins",
    onError: (error) => {
      throw error;
    }
  }, children: [
    /* @__PURE__ */ jsx(RichTextPlugin, { contentEditable: /* @__PURE__ */ jsx(ContentEditable, {}), ErrorBoundary: LexicalErrorBoundary }),
    /* @__PURE__ */ jsx(HistoryPlugin, {}),
    /* @__PURE__ */ jsx(OnChangePlugin, { onChange: props.onChange }),
    /* @__PURE__ */ jsx(ClearEditorPlugin, {}),
    /* @__PURE__ */ jsx(AutoFocusPlugin, {}),
    /* @__PURE__ */ jsx(Capture, { onEditor: props.onEditor })
  ] });
}
export {
  PluginsEditor
};
