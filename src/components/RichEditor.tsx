import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  ChevronDown,
  ChevronUp,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";
import { dehydrateDoc, hydrateDoc, savePastedImage, toDisplaySrc } from "../lib/media";
import { EMPTY_DOC } from "../types";
import { cn } from "../lib/format";

const AppImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: { default: null },
    };
  },
});

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function RichEditor({
  initialJson,
  onChange,
  placeholder = "Write notes…",
  minHeight,
  collapsibleToolbar = false,
}: {
  initialJson: string;
  onChange: (storageJson: string) => void;
  placeholder?: string;
  minHeight?: string;
  collapsibleToolbar?: boolean;
}) {
  const debounceRef = useRef<number | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const onChangeRef = useRef(onChange);
  const dirtyRef = useRef(false);
  const hydratingRef = useRef(true);
  const [toolbarOpen, setToolbarOpen] = useState(true);
  onChangeRef.current = onChange;

  const insertImage = async (file: File) => {
    const editor = editorRef.current;
    if (!editor) return;
    const dataUrl = await fileToDataUrl(file);
    const relative = await savePastedImage(dataUrl, file.type || "image/png");
    const src = await toDisplaySrc(relative);
    editor
      .chain()
      .focus()
      .insertContent({ type: "image", attrs: { src, path: relative } })
      .run();
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      AppImage.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: JSON.parse(EMPTY_DOC),
    editorProps: {
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              void insertImage(file);
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const images = [...files].filter((f) => f.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        images.forEach((file) => void insertImage(file));
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (hydratingRef.current) return;
      dirtyRef.current = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        onChangeRef.current(dehydrateDoc(JSON.stringify(instance.getJSON())));
      }, 500);
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    (async () => {
      const hydrated = await hydrateDoc(initialJson || EMPTY_DOC);
      if (cancelled || !editor) return;
      editor.commands.setContent(JSON.parse(hydrated));
      hydratingRef.current = false;
    })();
    return () => {
      cancelled = true;
    };
  }, [editor]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      const instance = editorRef.current;
      if (dirtyRef.current && instance && !instance.isDestroyed) {
        onChangeRef.current(dehydrateDoc(JSON.stringify(instance.getJSON())));
      }
    };
  }, []);

  const addLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  };

  const pickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void insertImage(file);
    };
    input.click();
  };

  if (!editor) return <div className="editor-shell h-32" />;

  const tools = (
    <>
      <ToolBtn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <Bold size={15} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <Italic size={15} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
      >
        <UnderlineIcon size={15} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading"
      >
        <Heading2 size={15} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullets"
      >
        <List size={15} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <ListOrdered size={15} />
      </ToolBtn>
      <ToolBtn active={editor.isActive("link")} onClick={addLink} title="Link">
        <Link2 size={15} />
      </ToolBtn>
      <ToolBtn onClick={pickImage} title="Insert image">
        <ImagePlus size={15} />
      </ToolBtn>
    </>
  );

  return (
    <div className="editor-shell">
      <div className={cn("editor-toolbar", collapsibleToolbar && !toolbarOpen && "editor-toolbar-collapsed")}>
        {!collapsibleToolbar || toolbarOpen ? tools : null}
        {collapsibleToolbar ? (
          <button
            type="button"
            className="btn btn-quiet btn-small editor-toolbar-toggle"
            title={toolbarOpen ? "Hide toolbar" : "Show toolbar"}
            onClick={() => setToolbarOpen((open) => !open)}
          >
            {toolbarOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        ) : null}
      </div>
      <EditorContent editor={editor} className="editor-body" style={minHeight ? { minHeight } : undefined} />
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn("btn btn-quiet btn-small", active && "bg-[var(--accent-soft)]")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
