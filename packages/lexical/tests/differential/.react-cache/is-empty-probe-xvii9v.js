import { jsx } from "react/jsx-runtime";
import { useLexicalIsTextContentEmpty } from "@lexical/react/useLexicalIsTextContentEmpty";
import { createEditor, ParagraphNode } from "lexical";
import { useEffect, useMemo, useRef } from "react";
function IsEmptyProbe(props) {
  const editor = useMemo(
    () => createEditor({
      namespace: "",
      nodes: [ParagraphNode],
      onError: (e) => {
        throw e;
      }
    }),
    []
  );
  const ref = useRef(null);
  useEffect(
    () => {
      editor.setRootElement(ref.current);
    },
    [ref, editor]
  );
  const isBlank = useLexicalIsTextContentEmpty(editor);
  useEffect(
    () => {
      props.onState(editor, isBlank);
    },
    [isBlank, editor]
  );
  return /* @__PURE__ */ jsx("div", { ref, contenteditable: "true" });
}
export {
  IsEmptyProbe
};
