import React, { useRef, useState } from 'react';
import { FileCode, Pencil, Trash2, RefreshCw, Eye, FolderOpen, FileArchive, FilePlus2 } from 'lucide-react';
import { ModuleInfo, ProjectDiagnostic, ProjectFile } from '../project/projectModel';
import { UiTheme } from '../config/uiPreferences';
import { TranslationDict } from '../i18n/translations';

interface ProjectExplorerProps {
  files: ProjectFile[];
  modules: ModuleInfo[];
  diagnostics: ProjectDiagnostic[];
  activeFileId: string | null;
  topModule: string;
  topCandidates: string[];
  theme?: UiTheme;
  t?: TranslationDict;
  onSelectFile: (id: string) => void;
  onRename: (id: string, newName: string) => string | undefined; // returns error text
  onDelete: (id: string) => void;
  onReplace: (id: string, content: string) => void;
  onAddFiles: (files: FileList) => void;
  onAddFolder: (files: FileList) => void;
  onAddZip: (files: FileList) => void;
  onChangeTop: (top: string) => void;
}

export const TopModuleSelector: React.FC<{
  topModule: string;
  modules: ModuleInfo[];
  topCandidates: string[];
  invalid: boolean;
  theme?: UiTheme;
  t?: TranslationDict;
  onChange: (top: string) => void;
}> = ({ topModule, modules, topCandidates, invalid, theme = 'warm-lab', t, onChange }) => {
  const isWarm = theme === 'warm-lab';
  const names = Array.from(new Set(modules.map((m) => m.name)));
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-300">
      <span className="text-slate-400">{t?.topModuleSelectorLabel ?? 'Top Module'}</span>
      <select
        value={names.includes(topModule) ? topModule : ''}
        onChange={(e) => onChange(e.target.value)}
        className={`bg-slate-950 border rounded-xl px-2.5 py-1.5 text-xs font-mono focus:outline-none ${
          invalid
            ? 'border-rose-500/70 text-rose-300'
            : isWarm
            ? 'border-amber-500/35 text-amber-200 focus:border-amber-400'
            : 'border-indigo-500/35 text-cyan-200'
        }`}
      >
        {!names.includes(topModule) && (
          <option value="">{`${t?.missingTopModulePrefix ?? '⚠ Missing top module'}${topModule ? ` (${topModule})` : ''}`}</option>
        )}
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
            {topCandidates.includes(n) ? '  (root)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
};

export const ProjectExplorer: React.FC<ProjectExplorerProps> = ({
  files,
  modules,
  diagnostics,
  activeFileId,
  topModule,
  topCandidates,
  theme = 'warm-lab',
  t,
  onSelectFile,
  onRename,
  onDelete,
  onReplace,
  onAddFiles,
  onAddFolder,
  onAddZip,
  onChangeTop,
}) => {
  const isWarm = theme === 'warm-lab';
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameError, setRenameError] = useState<string | undefined>();
  const replaceTarget = useRef<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const commitRename = (id: string) => {
    const err = onRename(id, renameText);
    setRenameError(err);
    if (!err) setRenamingId(null);
  };

  const btn =
    'p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition';

  return (
    <aside
      className={`w-full lg:w-72 shrink-0 bg-slate-950 border rounded-xl p-3 space-y-3 ${
        isWarm ? 'border-amber-500/25' : 'border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          {t?.projectExplorerTitle ?? 'Project Explorer'}
        </h3>
        <span className="text-[10px] text-slate-500 font-mono">
          {files.length} {t?.filesSuffix ?? 'files'}
        </span>
      </div>

      <TopModuleSelector
        topModule={topModule}
        modules={modules}
        topCandidates={topCandidates}
        invalid={!modules.some((m) => m.name === topModule)}
        theme={theme}
        t={t}
        onChange={onChangeTop}
      />

      <ul className="space-y-1 max-h-72 overflow-y-auto">
        {files.map((f) => {
          const fileMods = modules.filter((m) => m.fileId === f.id).map((m) => m.name);
          const hasErr = diagnostics.some((d) => d.severity === 'error' && d.file === f.name);
          return (
            <li
              key={f.id}
              className={`group rounded-lg border px-2 py-1.5 text-xs ${
                f.id === activeFileId
                  ? isWarm
                    ? 'bg-amber-500/15 border-amber-400/45'
                    : 'bg-emerald-500/15 border-emerald-400/40'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              {renamingId === f.id ? (
                <div className="space-y-1">
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(f.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => commitRename(f.id)}
                    className={`w-full bg-slate-950 border rounded px-1.5 py-0.5 font-mono text-xs text-slate-100 ${
                      isWarm ? 'border-amber-500/50' : 'border-emerald-500/50'
                    }`}
                  />
                  {renameError && <div className="text-rose-300 text-[10px]">{renameError}</div>}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectFile(f.id)}
                    className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                    title={f.name}
                  >
                    <FileCode
                      className={`w-3.5 h-3.5 shrink-0 ${
                        hasErr ? 'text-rose-400' : isWarm ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    />
                    <span className="truncate font-mono text-slate-100">{f.name}</span>
                  </button>
                  <button type="button" className={btn} title="View" onClick={() => onSelectFile(f.id)}>
                    <Eye className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className={btn}
                    title="Rename"
                    onClick={() => {
                      setRenamingId(f.id);
                      setRenameText(f.name);
                      setRenameError(undefined);
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className={btn}
                    title="Replace file contents"
                    onClick={() => {
                      replaceTarget.current = f.id;
                      replaceInput.current?.click();
                    }}
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className={`${btn} hover:text-rose-300`}
                    title="Delete"
                    onClick={() => {
                      if (window.confirm(`Delete ${f.name}?`)) onDelete(f.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
              {fileMods.length > 0 && renamingId !== f.id && (
                <div className="mt-0.5 pl-5 text-[10px] text-slate-500 font-mono truncate">
                  {fileMods.map((m) => (m === topModule ? `★ ${m}` : m)).join(', ')}
                </div>
              )}
            </li>
          );
        })}
        {files.length === 0 && (
          <li className="text-xs text-slate-500">
            {t?.noFilesHint ?? 'No files. Upload or drop a project.'}
          </li>
        )}
      </ul>

      <input
        ref={replaceInput}
        type="file"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const id = replaceTarget.current;
          if (file && id) onReplace(id, await file.text());
          e.target.value = '';
        }}
      />

      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-800">
        <label
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-slate-900 border border-slate-700 cursor-pointer ${
            isWarm ? 'hover:border-amber-500/50' : 'hover:border-emerald-500/50'
          }`}
        >
          <FilePlus2 className={`w-3 h-3 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />{' '}
          {t?.addFilesBtn ?? 'Add files'}
          <input type="file" multiple accept=".v,.sv,.vh,.svh,.hex,.mem,.mif,.txt" className="hidden"
            onChange={(e) => { if (e.target.files) onAddFiles(e.target.files); e.target.value = ''; }} />
        </label>
        <label
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-slate-900 border border-slate-700 cursor-pointer ${
            isWarm ? 'hover:border-amber-500/50' : 'hover:border-emerald-500/50'
          }`}
        >
          <FolderOpen className={`w-3 h-3 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />{' '}
          {t?.addFolderBtn ?? 'Add folder'}
          <input type="file" multiple className="hidden"
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => { if (e.target.files) onAddFolder(e.target.files); e.target.value = ''; }} />
        </label>
        <label
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-slate-900 border border-slate-700 cursor-pointer ${
            isWarm ? 'hover:border-amber-500/50' : 'hover:border-emerald-500/50'
          }`}
        >
          <FileArchive className={`w-3 h-3 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />{' '}
          {t?.addZipBtn ?? 'Add ZIP'}
          <input type="file" accept=".zip" className="hidden"
            onChange={(e) => { if (e.target.files) onAddZip(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
    </aside>
  );
};
