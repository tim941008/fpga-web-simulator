import React, { useMemo, useState } from 'react';
import { UiTheme } from '../config/uiPreferences';

type TokenType = 'keyword' | 'number' | 'string' | 'comment' | 'directive' | 'system';

interface HighlightToken {
  text: string;
  type?: TokenType;
}

const KEYWORDS = new Set(
  `  always always_comb always_ff always_latch and assign automatic begin bit buf byte case casex casez
  cell config deassign default defparam design disable edge else end endcase endconfig
  endfunction endgenerate endmodule endpackage endprimitive endspecify endtable endtask
  enum event for force foreach forever fork function generate genvar if ifnone initial inout
  input integer int interface join localparam logic longint modport module nand negedge nmos nor not or output
  package parameter pmos posedge primitive priority program property pullup pulldown reg
  release repeat return rnmos rpmos rtran rtranif0 rtranif1 signed small specparam
  real realtime ref shortint shortreal specify string struct supply0 supply1 table task time tran
  tranif0 tranif1 typedef union unsigned use uwire var vectored wait wand weak0 weak1 while wire
  wor xnor xor assert assume before bins break checker class const constraint cover cross dist
  endproperty endsequence extends interconnect inside let rand randc sequence solve timeprecision
  timeunit throughout type virtual`.split(/\s+/)
);

export function highlightVerilogLine(
  line: string,
  inBlockComment = false
): { tokens: HighlightToken[]; inBlockComment: boolean } {
  const tokens: HighlightToken[] = [];
  let index = 0;
  let commentOpen = inBlockComment;

  const push = (text: string, type?: TokenType) => {
    if (!text) return;
    const previous = tokens[tokens.length - 1];
    if (!type && previous && !previous.type) previous.text += text;
    else tokens.push({ text, type });
  };

  while (index < line.length) {
    if (commentOpen) {
      const close = line.indexOf('*/', index);
      if (close === -1) {
        push(line.slice(index), 'comment');
        index = line.length;
      } else {
        push(line.slice(index, close + 2), 'comment');
        index = close + 2;
        commentOpen = false;
      }
      continue;
    }

    if (line.startsWith('//', index)) {
      push(line.slice(index), 'comment');
      break;
    }

    if (line.startsWith('/*', index)) {
      const close = line.indexOf('*/', index + 2);
      if (close === -1) {
        push(line.slice(index), 'comment');
        commentOpen = true;
        break;
      }
      push(line.slice(index, close + 2), 'comment');
      index = close + 2;
      continue;
    }

    if (line[index] === '"') {
      const stringMatch = line.slice(index).match(/^"(?:\\.|[^"\\])*"?/);
      const text = stringMatch?.[0] ?? '"';
      push(text, 'string');
      index += text.length;
      continue;
    }

    const rest = line.slice(index);
    const match =
      rest.match(/^`[A-Za-z_][A-Za-z0-9_$]*/) ??
      rest.match(/^\$[A-Za-z_][A-Za-z0-9_$]*/) ??
      rest.match(/^\d+'[sS]?[bBoOdDhH][0-9a-fA-F_xXzZ?]+/) ??
      rest.match(/^\d+/) ??
      rest.match(/^[A-Za-z_][A-Za-z0-9_$]*/);

    if (match) {
      const text = match[0];
      const type: TokenType | undefined = text.startsWith('`')
        ? 'directive'
        : text.startsWith('$')
          ? 'system'
          : /^\d/.test(text)
            ? 'number'
            : KEYWORDS.has(text)
              ? 'keyword'
              : undefined;
      push(text, type);
      index += text.length;
      continue;
    }

    push(line[index]);
    index += 1;
  }

  return { tokens, inBlockComment: commentOpen };
}

const TOKEN_CLASSES: Record<TokenType, string> = {
  keyword: 'text-amber-300',
  number: 'text-violet-300',
  string: 'text-emerald-300',
  comment: 'text-slate-500 italic',
  directive: 'text-orange-300',
  system: 'text-cyan-300',
};

interface CodeEditorProps {
  value: string;
  fileName: string;
  disabled?: boolean;
  theme?: UiTheme;
  onChange: (value: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  fileName,
  disabled = false,
  theme = 'warm-lab',
  onChange,
}) => {
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const isWarm = theme === 'warm-lab';
  const supportsHighlight = /\.(?:v|sv|vh|svh)$/i.test(fileName);
  const lines = useMemo(() => {
    const sourceLines = value.split('\n');
    let inBlockComment = false;
    return sourceLines.map((line) => {
      const result = supportsHighlight
        ? highlightVerilogLine(line, inBlockComment)
        : { tokens: [{ text: line }], inBlockComment: false };
      inBlockComment = result.inBlockComment;
      return result.tokens;
    });
  }, [supportsHighlight, value]);

  return (
    <div
      className={`relative flex h-[460px] min-w-0 overflow-hidden rounded-xl border bg-slate-950 ${
        isWarm ? 'border-slate-800 focus-within:border-amber-500' : 'border-slate-800 focus-within:border-emerald-500'
      }`}
    >
      <div
        aria-hidden="true"
        className="z-10 w-12 shrink-0 overflow-hidden border-r border-slate-800 bg-slate-900/70 pt-4 text-right font-mono text-xs leading-5 text-slate-500 select-none"
      >
        <div style={{ transform: `translateY(-${scroll.top}px)` }}>
          {lines.map((_, index) => (
            <div key={index} className="h-5 pr-3">
              {index + 1}
            </div>
          ))}
        </div>
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden">
        <pre
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 m-0 min-h-full min-w-full whitespace-pre p-4 font-mono text-xs leading-5"
          style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
        >
          {lines.map((tokens, lineIndex) => (
            <React.Fragment key={lineIndex}>
              {tokens.map((token, tokenIndex) => (
                <span
                  key={tokenIndex}
                  className={
                    token.type === 'keyword' && !isWarm
                      ? 'text-emerald-300'
                      : token.type
                        ? TOKEN_CLASSES[token.type]
                        : 'text-slate-100'
                  }
                >
                  {token.text || ' '}
                </span>
              ))}
              {lineIndex < lines.length - 1 && '\n'}
            </React.Fragment>
          ))}
        </pre>
        <textarea
          aria-label={`Source editor: ${fileName || 'no file'}`}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            const target = event.currentTarget;
            setScroll({ top: target.scrollTop, left: target.scrollLeft });
          }}
          spellCheck={false}
          wrap="off"
          className={`absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-4 font-mono text-xs leading-5 text-transparent caret-slate-100 outline-none disabled:cursor-not-allowed ${
            isWarm ? 'selection:bg-amber-500/30' : 'selection:bg-emerald-500/30'
          }`}
          style={{ WebkitTextFillColor: 'transparent', tabSize: 2 }}
        />
      </div>
    </div>
  );
};
