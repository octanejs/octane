import { useState, type ComponentProps, type ElementRef, type ComponentPropsWithoutRef, type Ref, type FC, type OctaneNode, type ChangeEvent } from "octane";

// Shapes from migrating Memos and T3 Code: shadcn-style fields whose rest
// props carry React's per-edit `onChange`, `forwardRef` type arguments and
// annotations that name the global `React` namespace without importing it.

export function Input({ className, type, onChange, ...props }: ComponentProps<"input">) @{
  <input type={type} data-slot="input" className={className} onInput={onChange} {...props} />
}

export function Textarea({ className, onChange, ...props }: ComponentProps<"textarea">) @{
  <textarea
    data-slot="textarea"
    className={className}
    onInput={onChange}
    {...props}
  />
}

export const DialogHeader = ({ className, ref, ...props }: ComponentPropsWithoutRef<"div"> & { ref?: Ref<ElementRef<"div">> }) => @{ <div ref={ref} className={className} {...props} /> };

export const RenameDialog: FC<{ title: OctaneNode; onRename(name: string): void }> = ({
  title,
  onRename,
}) => @{
  const [note, setNote] = useState("");
  const handleNote = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setNote(e.currentTarget.value);
  <form onSubmit={() => onRename(note)}>
    <DialogHeader>{title}</DialogHeader>
    <Textarea value={note} onChange={handleNote} />
  </form>
};
