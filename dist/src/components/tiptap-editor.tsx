import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import Link from "@tiptap/extension-link";
import { Extension } from "@tiptap/core";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo2, Redo2,
  Table as TableIcon, Minus, Highlighter, Palette,
  Indent, Outdent, ChevronDown, RemoveFormatting,
  Minimize2, FileText, Pilcrow,
} from "lucide-react";

const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => el.style.fontSize?.replace(/pt|px/, "") || null,
          renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}pt` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: any) =>
        chain().setMark("textStyle", { fontSize }).run(),
    } as any;
  },
});

const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: el => el.style.lineHeight || null,
          renderHTML: attrs => attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setLineHeight: (lineHeight: string) => ({ commands }: any) =>
        commands.updateAttributes("paragraph", { lineHeight }),
    } as any;
  },
});

const TextIndent = Extension.create({
  name: "textIndent",
  addGlobalAttributes() {
    return [{
      types: ["paragraph"],
      attributes: {
        textIndent: {
          default: null,
          parseHTML: el => el.style.textIndent || null,
          renderHTML: attrs => attrs.textIndent != null ? { style: `text-indent: ${attrs.textIndent}` } : {},
        },
      },
    }];
  },
});

interface TiptapEditorProps {
  initialData: string;
  onChange?: (html: string) => void;
  onReady?: (editor: any) => void;
}

const FONTS = [
  "Times New Roman", "Arial", "Calibri", "Georgia",
  "Garamond", "Verdana", "Trebuchet MS", "Courier New",
];

const SIZES = ["8","9","10","11","12","13","14","16","18","20","24","28","32","36","48","72"];

const COLORS = ["#000000", "#FF0000", "#FF7700", "#FFFF00", "#00FF00", "#0077FF", "#FF00FF", "#FFA500", "#800080", "#FFC0CB", "#A52A2A", "#808080"];

const HIGHLIGHT_COLORS = ["#FFFF00", "#FF7700", "#FF6B6B", "#4ECDC4", "#95E1D3", "#FFD700", "#ADFF2F"];

const LINE_HEIGHTS = [
  { label: "Simples (1.0)", v: "1" },
  { label: "1,5 linhas", v: "1.5" },
  { label: "Duplo (2.0)", v: "2" },
];

export default function TiptapEditor({ initialData, onChange, onReady }: TiptapEditorProps) {
  const [fontInput, setFontInput] = useState("Times New Roman");
  const [sizeInput, setSizeInput] = useState("12");
  const [charCount, setCharCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [showFontList, setShowFontList] = useState(false);
  const [showSizeList, setShowSizeList] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState<"text" | "hl" | null>(null);
  const colorRef = useRef(null);
  const lastSetInitData = useRef<string | null | undefined>(undefined);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, codeBlock: false }),
      TextStyle,
      FontSize,
      FontFamily,
      Color,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      LineHeight,
      TextIndent,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({ openOnClick: false }),
    ],
    content: initialData || "<p></p>",
    editorProps: {
      attributes: { class: "word-editor-content", spellcheck: "true" },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html);
      const text = editor.getText();
      setCharCount(text.length);
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
      const font = editor.getAttributes("textStyle").fontFamily || "Times New Roman";
      const size = editor.getAttributes("textStyle").fontSize || "12";
      setFontInput(font);
      setSizeInput(size);
    },
    onSelectionUpdate: ({ editor }) => {
      const font = editor.getAttributes("textStyle").fontFamily || "Times New Roman";
      const size = editor.getAttributes("textStyle").fontSize || "12";
      setFontInput(font);
      setSizeInput(size);
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && onReady) {
      onReady(editor);
    }
  }, [editor, onReady]);

  useEffect(() => {
    if (editor && initialData !== undefined && initialData !== null) {
      if (initialData !== lastSetInitData.current) {
        lastSetInitData.current = initialData;
        editor.commands.setContent(initialData, { emitUpdate: false });
        const text = editor.getText();
        setCharCount(text.length);
        setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
      }
    }
  }, [editor, initialData]);

  const applyFont = useCallback((font: string) => {
    setFontInput(font);
    setShowFontList(false);
    (editor?.chain().focus() as any).setFontFamily(font).run();
  }, [editor]);

  const applySize = (size: string) => {
    setSizeInput(size);
    setShowSizeList(false);
    (editor?.chain().focus() as any).setFontSize(size).run();
  };

  const applyLineHeight = (lh: string) => {
    (editor?.chain().focus() as any).setLineHeight(lh).run();
  };

  if (!editor) return (
    <div className="flex items-center justify-center h-64 bg-[#f3f3f3]">
      <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );

  const TB = ({ onClick, active, title, children, disabled }: {
    onClick: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex items-center justify-center w-7 h-7 rounded text-sm transition-all select-none
        ${active ? "bg-[#cce5ff] border border-[#4a86e8]" : "hover:bg-[#e8e8e8]"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {children}
    </button>
  );

  const Sep = () => <div className="w-px h-5 bg-gray-300 mx-0.5 shrink-0" />;

  const toolbar = (
    <div className="word-toolbar bg-[#f3f3f3] border-b border-gray-300 select-none">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 overflow-x-auto">

        <TB onClick={() => editor.chain().focus().undo().run()} title="Desfazer (Ctrl+Z)" disabled={!editor.can().undo()}>
          <Undo2 className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().redo().run()} title="Refazer (Ctrl+Y)" disabled={!editor.can().redo()}>
          <Redo2 className="w-4 h-4" />
        </TB>
        <Sep />

        {/* Font family */}
        <div className="relative">
          <div className="flex items-center border border-gray-300 rounded bg-white hover:border-blue-400 cursor-text" style={{ minWidth: 130 }}>
            <input
              className="w-full px-2 py-0.5 text-xs outline-none bg-transparent font-[inherit]"
              style={{ fontFamily: fontInput }}
              value={fontInput}
              onChange={e => setFontInput(e.target.value)}
              onFocus={() => setShowFontList(true)}
              onBlur={() => setTimeout(() => setShowFontList(false), 200)}
              onKeyDown={e => { if (e.key === "Enter") applyFont(fontInput); }}
            />
            <ChevronDown className="w-3 h-3 mr-1 text-gray-400 shrink-0" />
          </div>
          {showFontList && (
            <div className="absolute z-50 top-full left-0 bg-white border border-gray-300 rounded shadow-lg max-h-52 overflow-y-auto w-48 mt-0.5">
              {FONTS.map(f => (
                <div key={f} className="px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50" style={{ fontFamily: f }}
                  onMouseDown={() => applyFont(f)}>{f}</div>
              ))}
            </div>
          )}
        </div>

        {/* Font size */}
        <div className="relative">
          <div className="flex items-center border border-gray-300 rounded bg-white hover:border-blue-400 cursor-text" style={{ width: 52 }}>
            <input
              className="w-full px-1 py-0.5 text-xs text-center outline-none bg-transparent"
              value={sizeInput}
              onChange={e => setSizeInput(e.target.value)}
              onFocus={() => setShowSizeList(true)}
              onBlur={() => setTimeout(() => setShowSizeList(false), 200)}
              onKeyDown={e => { if (e.key === "Enter") applySize(sizeInput); }}
            />
            <ChevronDown className="w-3 h-3 mr-0.5 text-gray-400 shrink-0" />
          </div>
          {showSizeList && (
            <div className="absolute z-50 top-full left-0 bg-white border border-gray-300 rounded shadow-lg max-h-52 overflow-y-auto w-20 mt-0.5">
              {SIZES.map(s => (
                <div key={s} className="px-3 py-1 text-xs cursor-pointer hover:bg-blue-50 text-center"
                  onMouseDown={() => applySize(s)}>{s}</div>
              ))}
            </div>
          )}
        </div>

        <Sep />

        <TB onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito (Ctrl+B)">
          <Bold className="w-4 h-4" strokeWidth={editor.isActive("bold") ? 3 : 2} />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico (Ctrl+I)">
          <Italic className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado (Ctrl+U)">
          <UnderlineIcon className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Tachado">
          <Strikethrough className="w-4 h-4" />
        </TB>

        <Sep />

        {/* Text color */}
        <div className="relative" ref={colorRef}>
          <button type="button" title="Cor do texto"
            className="flex flex-col items-center justify-center w-7 h-7 rounded hover:bg-[#e8e8e8] cursor-pointer"
            onClick={() => setShowColorPicker(showColorPicker === "text" ? null : "text")}>
            <span className="text-xs font-bold leading-none" style={{ color: "#000" }}>A</span>
            <div className="w-5 h-1 mt-0.5 rounded-sm bg-red-500" />
          </button>
          <button type="button" title="Destaque"
            className="flex flex-col items-center justify-center w-7 h-7 rounded hover:bg-[#e8e8e8] cursor-pointer"
            onClick={() => setShowColorPicker(showColorPicker === "hl" ? null : "hl")}>
            <Highlighter className="w-3.5 h-3.5" />
            <div className="w-5 h-1 mt-0.5 rounded-sm bg-yellow-300" />
          </button>
          {showColorPicker && (
            <div className="absolute z-50 top-full left-0 bg-white border border-gray-300 rounded shadow-xl p-2 mt-1" style={{ width: 184 }}>
              <div className="text-[10px] text-gray-500 mb-1">{showColorPicker === "text" ? "Cor do texto" : "Destaque"}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {(showColorPicker === "text" ? COLORS : HIGHLIGHT_COLORS).map(c => (
                  <button key={c} type="button" title={c}
                    className="w-5 h-5 rounded-sm border border-gray-200 hover:scale-110 transition-transform"
                    style={{ background: c }}
                    onClick={() => {
                      if (showColorPicker === "text") editor.chain().focus().setColor(c).run();
                      else editor.chain().focus().toggleHighlight({ color: c }).run();
                      setShowColorPicker(null);
                    }} />
                ))}
              </div>
              <button type="button" className="mt-1 text-[10px] text-blue-600 hover:underline w-full text-left"
                onClick={() => {
                  if (showColorPicker === "text") editor.chain().focus().unsetColor().run();
                  else editor.chain().focus().unsetHighlight().run();
                  setShowColorPicker(null);
                }}>Remover cor</button>
            </div>
          )}
        </div>

        <Sep />

        <TB onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Alinhar à esquerda (Ctrl+E)">
          <AlignLeft className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Centralizar (Ctrl+E)">
          <AlignCenter className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Alinhar à direita">
          <AlignRight className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })} title="Justificar">
          <AlignJustify className="w-4 h-4" />
        </TB>

        <Sep />

        {/* Line spacing */}
        <div className="relative group">
          <button type="button" title="Espaçamento entre linhas"
            className="flex items-center gap-0.5 px-1.5 py-1 rounded text-xs hover:bg-[#e8e8e8] border border-transparent hover:border-gray-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <ChevronDown className="w-3 h-3" />
          </button>
          <div className="absolute z-50 top-full left-0 hidden group-hover:block bg-white border border-gray-300 rounded shadow-lg w-52 mt-0.5">
            {LINE_HEIGHTS.map(({ label, v }) => (
              <div key={v} className="px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50"
                onClick={() => applyLineHeight(v)}>{label}</div>
            ))}
          </div>
        </div>

        <Sep />

        <TB onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista de marcadores">
          <List className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerada">
          <ListOrdered className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().sinkListItem("listItem").run()} title="Aumentar recuo (Tab)">
          <Indent className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().liftListItem("listItem").run()} title="Diminuir recuo (Shift+Tab)">
          <Outdent className="w-4 h-4" />
        </TB>

        <Sep />

        {/* Headings */}
        <div className="relative group">
          <button type="button" title="Estilo de parágrafo"
            className="flex items-center gap-0.5 px-1.5 py-1 rounded text-xs hover:bg-[#e8e8e8] border border-transparent hover:border-gray-300 min-w-[70px]">
            <Pilcrow className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {editor.isActive("heading", { level: 1 }) ? "Título 1" :
               editor.isActive("heading", { level: 2 }) ? "Título 2" :
               editor.isActive("heading", { level: 3 }) ? "Título 3" :
               editor.isActive("heading", { level: 4 }) ? "Título 4" : "Parágrafo"}
            </span>
            <ChevronDown className="w-3 h-3 shrink-0" />
          </button>
          <div className="absolute z-50 top-full left-0 hidden group-hover:block bg-white border border-gray-300 rounded shadow-lg w-40 mt-0.5">
            <div className="px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50" onClick={() => editor.chain().focus().setParagraph().run()}>Parágrafo</div>
            {[1,2,3,4].map(l => (
              <div key={l} className="px-3 py-1.5 cursor-pointer hover:bg-blue-50"
                style={{ fontSize: [18,16,14,12][l-1], fontWeight: "bold" }}
                onClick={() => editor.chain().focus().toggleHeading({ level: l as 1|2|3|4 }).run()}>
                Título {l}
              </div>
            ))}
          </div>
        </div>

        <Sep />

        <TB onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Inserir tabela">
          <TableIcon className="w-4 h-4" />
        </TB>
        <TB onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha horizontal">
          <Minus className="w-4 h-4" />
        </TB>

        <Sep />

        {/* Legal presets */}
        <div className="relative group">
          <button type="button" title="Formatação jurídica ABNT"
            className="flex items-center gap-0.5 px-2 py-1 rounded text-xs font-medium hover:bg-[#e8e8e8] border border-gray-300 text-blue-700">
            <FileText className="w-3.5 h-3.5" />
            <span>Jurídico</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          <div className="absolute z-50 top-full left-0 hidden group-hover:block bg-white border border-gray-300 rounded shadow-lg w-56 mt-0.5">
            <div className="px-3 py-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wide border-b">Estilos ABNT/JEF</div>
            <div className="px-3 py-2 text-xs cursor-pointer hover:bg-blue-50"
              onClick={() => (editor?.chain().focus() as any).setLineHeight("1.5").run()}>
              <div className="font-medium">Parágrafo normal</div>
              <div className="text-gray-400">Espaç. 1.5, justificado</div>
            </div>
            <div className="px-3 py-2 text-xs cursor-pointer hover:bg-blue-50"
              onClick={() => editor.chain().focus().setTextAlign("center").toggleBold().run()}>
              <div className="font-medium">Título centralizado</div>
              <div className="text-gray-400">Centro + negrito</div>
            </div>
            <div className="px-3 py-2 text-xs cursor-pointer hover:bg-blue-50"
              onClick={() => {
                editor.chain().focus().setTextAlign("justify").run();
                (editor.chain().focus() as any).setFontSize("10").run();
                (editor.chain().focus() as any).setLineHeight("1").run();
              }}>
              <div className="font-medium">Citação ABNT (4cm)</div>
              <div className="text-gray-400">10pt, simples, justificado</div>
            </div>
            <div className="px-3 py-2 text-xs cursor-pointer hover:bg-blue-50"
              onClick={() => { (editor.chain().focus() as any).setFontSize("12").run(); applyFont("Times New Roman"); }}>
              <div className="font-medium">Times New Roman 12pt</div>
              <div className="text-gray-400">Padrão petição judicial</div>
            </div>
          </div>
        </div>

        <Sep />

        <TB onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Remover formatação">
          <RemoveFormatting className="w-4 h-4" />
        </TB>

        <div className="ml-auto">
          <TB onClick={() => {
            const el = document.querySelector(".word-editor-wrap") as HTMLElement;
            if (el) { el.style.position = el.style.position === "fixed" ? "" : "fixed"; el.style.inset = el.style.inset === "0px" ? "" : "0px"; el.style.zIndex = el.style.zIndex === "9999" ? "" : "9999"; }
          }} title="Tela cheia">
            <Minimize2 className="w-4 h-4" />
          </TB>
        </div>
      </div>
    </div>
  );

  return (
    <div className="word-editor-wrap flex flex-col bg-[#f3f3f3]" style={{ minHeight: 600 }} data-testid="tiptap-editor">
      {toolbar}

      {/* Page canvas */}
      <div className="flex-1 overflow-auto py-6 px-4" style={{ background: "#f3f3f3", minHeight: 500 }}
        onClick={() => editor.commands.focus()}>
        <div className="word-page mx-auto bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
          style={{
            width: "21cm",
            minHeight: "29.7cm",
            padding: "3cm 3cm 3cm 3cm",
            boxSizing: "border-box",
            position: "relative",
          }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-gray-300 bg-[#f3f3f3] text-xs text-gray-500 shrink-0">
        <div className="flex items-center gap-4">
          <span>{wordCount} palavras</span>
          <span>{charCount} caracteres</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Times New Roman · 12pt · A4</span>
        </div>
      </div>

      <style>{`
        .word-editor-wrap { border: 1px solid #d1d1d1; border-radius: 4px; overflow: hidden; }
        .word-page { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #000; }
        .word-editor-content { outline: none; min-height: 24cm; cursor: text; }
        .word-editor-content p { margin: 0 0 12pt 0; text-align: justify; text-indent: 4cm; line-height: 1.5; min-height: 1.5em; }
        .word-editor-content h1 { font-size: 14pt; font-weight: bold; text-align: center; text-transform: uppercase; text-indent: 0 !important; margin: 24pt 0 12pt; line-height: 1.5; }
        .word-editor-content h2 { font-size: 12pt; font-weight: bold; text-align: center; text-transform: uppercase; text-indent: 0 !important; margin: 20pt 0 10pt; line-height: 1.5; }
        .word-editor-content h3 { font-size: 12pt; font-weight: bold; text-align: justify; text-indent: 0 !important; margin: 16pt 0 8pt; line-height: 1.5; }
        .word-editor-content h4 { font-size: 12pt; font-weight: bold; text-indent: 0 !important; margin: 12pt 0 6pt; line-height: 1.5; }
        .word-editor-content h5, .word-editor-content h6 { font-size: 12pt; font-weight: bold; text-indent: 0 !important; margin: 8pt 0 4pt; }
        .word-editor-content ul, .word-editor-content ol { padding-left: 1.5em; margin: 4pt 0; text-indent: 0; }
        .word-editor-content li { margin: 2pt 0; line-height: 1.5; text-indent: 0; }
        .word-editor-content blockquote { margin: 12pt 4cm 12pt 4cm; padding: 0; font-size: 10pt; line-height: 1.0; border-left: none; font-style: normal; text-indent: 0 !important; text-align: justify; }
        .word-editor-content table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
        .word-editor-content td, .word-editor-content th { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; }
        .word-editor-content th { font-weight: bold; background: #f0f0f0; }
        .word-editor-content hr { border: none; border-top: 1px solid #ccc; margin: 12pt 0; }
        .word-editor-content a { color: #1155cc; text-decoration: underline; }
        .word-editor-content .selectedCell { background: #c8dfff !important; }
        .word-editor-content strong { font-weight: bold; }
        .word-editor-content em { font-style: italic; }
        .word-editor-content u { text-decoration: underline; }
        .word-editor-content s { text-decoration: line-through; }
        .word-editor-content mark { background-color: #ffff00; }
        .ProseMirror-focused { outline: none; }
        .ProseMirror .is-editor-empty:first-child::before {
          content: 'Comece a escrever ou cole o texto gerado pela IA...';
          float: left; color: #adb5bd; pointer-events: none; height: 0;
        }
        @media (max-width: 768px) {
          .word-page { width: 100% !important; padding: 1.5cm !important; min-height: auto !important; }
          .word-editor-wrap { min-height: 500px; }
        }
      `}</style>
    </div>
  );
}

