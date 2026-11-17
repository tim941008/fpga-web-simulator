// @ts-nocheck
// Subset of 8bitworkshop src/common/util.ts (GPL-3.0) needed by the HDL runtime.

export function byteArrayToString(data: number[] | Uint8Array): string {
  var str = '';
  if (data != null) {
    var charLUT = new Array();
    for (var i = 0; i < 256; ++i) charLUT[i] = String.fromCharCode(i);
    var len = data.length;
    for (var i = 0; i < len; i++) str += charLUT[data[i]];
  }
  return str;
}

// only does primitives, 1D arrays and no recursion
export function safe_extend(deep, dest, src) {
  for (var key in src) {
    var val = src[key];
    var type = typeof val;
    if (val === null || type == 'undefined') {
      dest[key] = val;
    } else if (type == 'function') {
      // ignore function
    } else if (type == 'object') {
      if (val['slice']) {
        dest[key] = val.slice();
      }
    } else {
      dest[key] = val;
    }
  }
  return dest;
}

export function arrayCompare(a: ArrayLike<any>, b: ArrayLike<any>): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] != b[i]) return false;
  return true;
}

export class XMLParseError extends Error {}

export interface XMLNode {
  type: string;
  text: string | null;
  children: XMLNode[];
  attrs: { [id: string]: string };
  obj: any;
}

export type XMLVisitFunction = (node: XMLNode) => any;

function escapeXML(s: string): string {
  if (s.indexOf('&') >= 0) {
    return s
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&');
  } else {
    return s;
  }
}

export function parseXMLPoorly(s: string, openfn?: XMLVisitFunction, closefn?: XMLVisitFunction): XMLNode {
  const tag_re = /[<]([/]?)([?a-z_-]+)([^>]*)[>]+|(\s*[^<]+)/gi;
  const attr_re = /\s*(\w+)="(.*?)"\s*/gi;
  var fm: RegExpMatchArray;
  var stack: XMLNode[] = [];
  var top: XMLNode;
  var ident: string;

  function closetop() {
    top = stack.pop();
    if (top == null || top.type != ident) throw new XMLParseError('mismatch close tag: ' + ident);
    if (closefn) {
      top.obj = closefn(top);
    }
    if (stack.length == 0) throw new XMLParseError('close tag without open: ' + ident);
    stack[stack.length - 1].children.push(top);
  }
  function parseattrs(as: string): { [id: string]: string } {
    var am;
    var attrs = {};
    if (as != null) {
      while ((am = attr_re.exec(as))) {
        attrs[am[1]] = escapeXML(am[2]);
      }
    }
    return attrs;
  }
  while ((fm = tag_re.exec(s))) {
    var [_m0, close, identMatch, attrs, content] = fm;
    ident = identMatch;
    if (close) {
      closetop();
    } else if (ident) {
      var node = { type: ident, text: null, children: [], attrs: parseattrs(attrs), obj: null };
      stack.push(node);
      if (openfn) {
        node.obj = openfn(node);
      }
      if (attrs && attrs.endsWith('/')) closetop();
    } else if (content != null) {
      if (stack.length == 0) throw new XMLParseError('content without element');
      var txt = escapeXML(content as string).trim();
      if (txt.length) stack[stack.length - 1].text = txt;
    }
  }
  if (stack.length != 1) throw new XMLParseError('tag not closed');
  if (stack[0].type != '?xml') throw new XMLParseError('?xml needs to be first element');
  return top;
}
