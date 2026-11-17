import { PortDefinition } from '../types/fpga';

export interface VerilogParseResult {
  topModule: string;
  ports: PortDefinition[];
  internalSignals: PortDefinition[];
  parameters: Record<string, bigint>;
}

/**
 * Strip single-line and multi-line comments from Verilog source code
 */
export function stripVerilogComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/**
 * Evaluates constant expressions like "15", "8-1", "16'hFFFF"
 */
export function evalConstantInt(expr: string, params: Record<string, bigint> = {}): number {
  let clean = expr.trim();
  for (const [k, v] of Object.entries(params)) {
    clean = clean.replace(new RegExp(`\\b${k}\\b`, 'g'), v.toString());
  }
  const sizedMatch = clean.match(/^(\d+)?'([bBdDhHoO])([0-9a-fA-F_]+)$/);
  if (sizedMatch) {
    const baseChar = sizedMatch[2].toLowerCase();
    const digits = sizedMatch[3].replace(/_/g, '');
    const radix = baseChar === 'h' ? 16 : baseChar === 'b' ? 2 : baseChar === 'o' ? 8 : 10;
    return parseInt(digits, radix);
  }
  try {
    if (/^[0-9+\-*/()\s]+$/.test(clean)) {
      return Math.floor(Function(`"use strict"; return (${clean});`)());
    }
  } catch {
    // fallback
  }
  const n = parseInt(clean, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Extracts module name, ports, parameters, and internal signals from Verilog (.v) files
 */
export function parseVerilogSource(sources: string[]): VerilogParseResult {
  const combined = stripVerilogComments(sources.join('\n\n'));
  const parameters: Record<string, bigint> = {};

  // Extract parameter / localparam declarations
  const paramRegex = /\b(?:parameter|localparam)\s+(?:integer\s+|signed\s+|\[[^\]]+\]\s*)?([A-Za-z_][A-Za-z0-9_$]*)\s*=\s*([^;,)]+)/g;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = paramRegex.exec(combined)) !== null) {
    const name = pMatch[1];
    const val = evalConstantInt(pMatch[2], parameters);
    parameters[name] = BigInt(val);
  }

  // Find module declaration
  const moduleRegex = /\bmodule\s+([A-Za-z_][A-Za-z0-9_$]*)\s*(?:#\s*\([\s\S]*?\)\s*)?\(([\s\S]*?)\)\s*;([\s\S]*?)\bendmodule\b/g;
  const modules: Array<{
    name: string;
    headerPorts: string;
    body: string;
  }> = [];

  let mMatch: RegExpExecArray | null;
  while ((mMatch = moduleRegex.exec(combined)) !== null) {
    modules.push({
      name: mMatch[1],
      headerPorts: mMatch[2],
      body: mMatch[3],
    });
  }

  if (modules.length === 0) {
    return {
      topModule: 'top',
      ports: [],
      internalSignals: [],
      parameters,
    };
  }

  // Pick the top module (either the first module or one that isn't instantiated inside another)
  const instantiated = new Set<string>();
  for (const mod of modules) {
    for (const candidate of modules) {
      if (candidate.name === mod.name) continue;
      const instRegex = new RegExp(`\\b${candidate.name}\\s+(?:#\\s*\\([\\s\\S]*?\\)\\s*)?[A-Za-z_][A-Za-z0-9_$]*\\s*\\(`, 'g');
      if (instRegex.test(mod.body)) {
        instantiated.add(candidate.name);
      }
    }
  }
  const topMod = modules.find((m) => !instantiated.has(m.name)) ?? modules[0];

  const portsMap = new Map<string, PortDefinition>();
  const internalMap = new Map<string, PortDefinition>();

  const parseRange = (rangeStr?: string): { msb: number; lsb: number; width: number } => {
    if (!rangeStr) return { msb: 0, lsb: 0, width: 1 };
    const parts = rangeStr.replace(/[\[\]]/g, '').split(':');
    if (parts.length !== 2) return { msb: 0, lsb: 0, width: 1 };
    const msb = evalConstantInt(parts[0], parameters);
    const lsb = evalConstantInt(parts[1], parameters);
    return {
      msb,
      lsb,
      width: Math.abs(msb - lsb) + 1,
    };
  };

  // Parse ANSI style ports inside module header
  const ansiPortRegex = /\b(input|output|inout)\b\s*(?:(wire|reg|logic)\b\s*)?(?:signed\b\s*)?(\[[^\]]+\])?\s*([^;()]+)/g;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = ansiPortRegex.exec(topMod.headerPorts)) !== null) {
    const direction = aMatch[1] as 'input' | 'output' | 'inout';
    const isReg = aMatch[2] === 'reg' || aMatch[2] === 'logic';
    const { msb, lsb, width } = parseRange(aMatch[3]);
    const namesChunk = aMatch[4];

    // Split by comma, stopping if another direction keyword appears
    const tokens = namesChunk.split(',');
    for (const rawTok of tokens) {
      const tok = rawTok.trim();
      if (!tok) continue;
      if (/^(input|output|inout)\b/.test(tok)) break;
      const cleanName = tok.split('=')[0].trim().match(/^([A-Za-z_][A-Za-z0-9_$]*)/)?.[1];
      if (cleanName && !['input', 'output', 'inout', 'wire', 'reg', 'logic', 'signed'].includes(cleanName)) {
        portsMap.set(cleanName, {
          name: cleanName,
          direction,
          msb,
          lsb,
          width,
          isReg,
        });
      }
    }
  }

  // Also check body for non-ANSI port declarations & internal reg/wire declarations
  const bodyStatements = topMod.body.split(';');
  for (const stmt of bodyStatements) {
    const trimmed = stmt.trim();
    const portDecl = trimmed.match(/^(input|output|inout)\b\s*(?:(wire|reg|logic)\b\s*)?(?:signed\b\s*)?(\[[^\]]+\])?\s*(.+)$/);
    if (portDecl) {
      const direction = portDecl[1] as 'input' | 'output' | 'inout';
      const isReg = portDecl[2] === 'reg' || portDecl[2] === 'logic';
      const { msb, lsb, width } = parseRange(portDecl[3]);
      const names = portDecl[4].split(',');
      for (const n of names) {
        const cleanName = n.trim().split('=')[0].trim().match(/^([A-Za-z_][A-Za-z0-9_$]*)/)?.[1];
        if (cleanName) {
          portsMap.set(cleanName, { name: cleanName, direction, msb, lsb, width, isReg });
        }
      }
      continue;
    }

    const netDecl = trimmed.match(/^(wire|reg|logic)\b\s*(?:signed\b\s*)?(\[[^\]]+\])?\s*(.+)$/);
    if (netDecl) {
      const isReg = netDecl[1] === 'reg' || netDecl[1] === 'logic';
      const { msb, lsb, width } = parseRange(netDecl[2]);
      const names = netDecl[3].split(',');
      for (const n of names) {
        const cleanName = n.trim().split('=')[0].trim().match(/^([A-Za-z_][A-Za-z0-9_$]*)/)?.[1];
        if (cleanName) {
          if (portsMap.has(cleanName)) {
            const existing = portsMap.get(cleanName)!;
            if (isReg) existing.isReg = true;
          } else {
            internalMap.set(cleanName, {
              name: cleanName,
              direction: 'inout',
              msb,
              lsb,
              width,
              isReg,
            });
          }
        }
      }
    }
  }

  return {
    topModule: topMod.name,
    ports: Array.from(portsMap.values()),
    internalSignals: Array.from(internalMap.values()),
    parameters,
  };
}
