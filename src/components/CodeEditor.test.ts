import { describe, expect, it } from 'vitest';
import { highlightVerilogLine } from './CodeEditor';

describe('Verilog source highlighting', () => {
  it('classifies keywords, sized numbers, strings, directives, and system tasks', () => {
    const result = highlightVerilogLine("`define WIDTH 8\nmodule $display \"ready\" 8'hA5");

    expect(result.tokens.filter((token) => token.type).map((token) => [token.text, token.type])).toEqual([
      ['`define', 'directive'],
      ['8', 'number'],
      ['module', 'keyword'],
      ['$display', 'system'],
      ['"ready"', 'string'],
      ["8'hA5", 'number'],
    ]);
  });

  it('keeps block comments active across lines and resumes highlighting after closing', () => {
    const firstLine = highlightVerilogLine('/* comment');
    expect(firstLine.inBlockComment).toBe(true);
    expect(firstLine.tokens).toEqual([{ text: '/* comment', type: 'comment' }]);

    const secondLine = highlightVerilogLine('still comment */ assign ready = 1;', firstLine.inBlockComment);
    expect(secondLine.inBlockComment).toBe(false);
    expect(secondLine.tokens.filter((token) => token.type).map((token) => [token.text, token.type])).toEqual([
      ['still comment */', 'comment'],
      ['assign', 'keyword'],
      ['1', 'number'],
    ]);
  });

  it('leaves line comments unparsed through the end of the line', () => {
    const result = highlightVerilogLine('wire ready; // module ignored');

    expect(result.tokens.filter((token) => token.type).map((token) => [token.text, token.type])).toEqual([
      ['wire', 'keyword'],
      ['// module ignored', 'comment'],
    ]);
  });
});
