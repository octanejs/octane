import { jsx } from "react/jsx-runtime";
import { ContentEditableElement } from "@lexical/react/LexicalContentEditable";
function CeeProbe(props) {
  return /* @__PURE__ */ jsx(ContentEditableElement, { editor: props.editor, ...props.ceProps });
}
export {
  CeeProbe
};
