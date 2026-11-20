/* eslint-disable */
// =============================================================================
// Verilator WebAssembly compile worker (classic Web Worker, not bundled by Vite)
//
// Runs verilator_bin.wasm (Verilator compiled with Emscripten, taken from
// 8bitworkshop - https://github.com/sehugg/8bitworkshop, GPL-3.0) inside the
// browser. It parses/elaborates the uploaded Verilog and returns Verilator's
// XML netlist, which the main thread turns into a runnable WASM model.
//
// Request : { id, files: [{ name, content }], top }
// Response: { id, ok, xml?, errors: [{ severity, file, line, msg }], log: [] }
// =============================================================================

var verilatorWasmModule = null; // cached WebAssembly.Module

importScripts('verilator_bin.js');

function getVerilatorModule() {
  if (verilatorWasmModule) return Promise.resolve(verilatorWasmModule);
  return fetch('verilator_bin.wasm')
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to fetch verilator_bin.wasm: HTTP ' + r.status);
      return r.arrayBuffer();
    })
    .then(function (buf) {
      return WebAssembly.compile(buf);
    })
    .then(function (mod) {
      verilatorWasmModule = mod;
      return mod;
    });
}

var ERR_RE = /%(Error|Warning)(?:-[A-Z0-9_]+)?: (?:(.+?):(\d+):(?:\d+:)?)?\s*(.+)/i;

function compile(req) {
  var errors = [];
  var log = [];
  var safeToOriginal = {};

  function resolveOriginalFile(path) {
    if (!path) return null;
    var clean = path.replace(/^\.\//, '');
    return safeToOriginal[clean] || safeToOriginal[path] || path;
  }

  function onStdout(s) {
    log.push(s);
  }
  function onStderr(s) {
    log.push(s);
    var m = ERR_RE.exec(s);
    if (m) {
      var msg = m[4];
      if (/Exiting due to \d+/.test(msg) || /Use ["]\/[*]/.test(msg)) return;
      errors.push({
        severity: m[1].toLowerCase() === 'warning' ? 'warning' : 'error',
        file: resolveOriginalFile(m[2] || null),
        line: m[3] ? parseInt(m[3], 10) : 0,
        msg: msg,
      });
    }
  }

  return getVerilatorModule().then(function (wasmMod) {
    var mod = self.verilator_bin({
      instantiateWasm: function (imports, receiveInstance) {
        var inst = new WebAssembly.Instance(wasmMod, imports);
        receiveInstance(inst);
        return inst.exports;
      },
      noInitialRun: true,
      noExitRuntime: true,
      print: onStdout,
      printErr: onStderr,
      wasmMemory: new WebAssembly.Memory({ initial: 1024, maximum: 16384 }), // 64MB..1GB (exact limits required by precompiled verilator_bin.wasm)
    });

    var FS = mod.FS;
    var paths = [];
    var incDirs = {};
    req.files.forEach(function (f) {
      // keep the folder structure (multi-file projects); sanitize every path segment
      var segs = f.name.replace(/\\/g, '/').split('/').filter(function (s) { return s && s !== '.' && s !== '..'; })
        .map(function (s) { return s.replace(/[^A-Za-z0-9_.-]/g, '_'); });
      if (!segs.length) return;
      var dir = '';
      for (var i = 0; i < segs.length - 1; i++) {
        dir = dir ? dir + '/' + segs[i] : segs[i];
        try { FS.mkdir(dir); } catch (e) { /* exists */ }
      }
      var safe = segs.join('/');
      safeToOriginal[safe] = f.name;
      FS.writeFile(safe, f.content);
      if (dir) incDirs[dir] = true;
      if (/\.(v|sv)$/i.test(safe)) paths.push(safe);
    });

    var top = req.top;
    var incArgs = ['-I.'].concat(Object.keys(incDirs).map(function (d) { return '-I' + d; }));
    var args = incArgs.concat([
      '--cc', '-O3',
      '-Wall', '-Wno-fatal',
      '-Wno-DECLFILENAME', '-Wno-UNUSED', '-Wno-EOFNEWLINE', '-Wno-PROCASSWIRE',
      '-Wno-WIDTH', '-Wno-CASEINCOMPLETE', '-Wno-UNDRIVEN', '-Wno-PINCONNECTEMPTY',
      '--x-assign', 'fast', '--noassert', '--pins-sc-biguint',
      '--unroll-count', '256', '--unroll-stmts', '65536',
      '--debug-check', // makes this Verilator build emit obj_dir/V<top>.xml
      '--top-module', top,
    ]).concat(paths);

    try {
      (mod.callMain || mod.run)(args);
    } catch (e) {
      // Emscripten throws ExitStatus on non-zero exit; real errors were printed to stderr.
      if (!errors.some(function (x) { return x.severity === 'error'; })) {
        errors.push({ severity: 'error', file: null, line: 0, msg: 'Verilator internal error: ' + e });
      }
    }

    if (errors.some(function (x) { return x.severity === 'error'; })) {
      return { ok: false, errors: errors, log: log };
    }

    var xmlPath = 'obj_dir/V' + top + '.xml';
    var xml;
    try {
      xml = FS.readFile(xmlPath, { encoding: 'utf8' });
    } catch (e) {
      errors.push({ severity: 'error', file: null, line: 0, msg: 'Verilator produced no XML (' + xmlPath + ')' });
      return { ok: false, errors: errors, log: log };
    }
    return { ok: true, xml: xml, errors: errors, log: log };
  });
}

self.onmessage = function (ev) {
  var req = ev.data;
  compile(req)
    .then(function (res) {
      res.id = req.id;
      self.postMessage(res);
    })
    .catch(function (e) {
      self.postMessage({
        id: req.id,
        ok: false,
        errors: [{ severity: 'error', file: null, line: 0, msg: String(e && e.message ? e.message : e) }],
        log: [],
      });
    });
};
