import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Table2,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import {
  ImportMode,
  ParsedImportResult,
  ParsedWordRow,
  TableRowInput,
  WordCard,
  WordGroup,
} from '../types/flashcard';
import {
  HskParsedWordRow,
  isOfficialHskText,
  parseOfficialHskText,
} from '../utils/hskParser';
import {
  DelimiterOption,
  parseDelimitedText,
  parseJsonImport,
  parseTableRows,
} from '../utils/importers';
import { convertNumberedPinyinToMarks } from '../utils/listTools';
import { extractTextFromPdfBuffer } from '../utils/pdfReader';

export interface ImportConfirmPayload {
  rows: (ParsedWordRow & { hskLevel?: number })[];
  targetGroupId: string;
  newGroupName?: string;
  splitByHskLevel?: boolean;
  skipDuplicates: boolean;
}

interface ImportModalProps {
  isOpen: boolean;
  groups: WordGroup[];
  existingCards: WordCard[];
  defaultGroupId: string;
  onClose: () => void;
  onConfirmImport: (payload: ImportConfirmPayload) => void;
}

const SAMPLE_TEXT = `机场 | jīchǎng | airport | travel
护照 | hùzhào | passport
地铁 | dìtiě | subway | metro
出租车 | chūzūchē | taxi`;

const SAMPLE_HSK_TEXT = `序号 等级 词语 拼音 词性
1 1 爱 ài 动
7 1（4） 半 bàn 数、（副）
14 1 不客气 bú kèqi
363 2 机场 jīchǎng 名
375 2 酒店 jiǔdiàn 名
504 3 安静 ānjìng 形
674 3 护照 hùzhào 名`;

const OFFICIAL_HSK_PDF_URL = '/assets/aistudio/1-3______6bc15a87.pdf';

function createEmptyTableRows(count: number): TableRowInput[] {
  return Array.from({ length: count }, () => ({
    hanzi: '',
    pinyin: '',
    translation: '',
    notes: '',
  }));
}

export function ImportModal({
  isOpen,
  groups,
  existingCards,
  defaultGroupId,
  onClose,
  onConfirmImport,
}: ImportModalProps) {
  const [mode, setMode] = useState<ImportMode>('file');
  const [targetSelection, setTargetSelection] = useState<'existing' | 'new' | 'split-hsk'>(
    groups.length > 0 ? 'existing' : 'new'
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    defaultGroupId !== 'all' && groups.some((g) => g.id === defaultGroupId)
      ? defaultGroupId
      : groups[0]?.id ?? ''
  );
  const [newGroupName, setNewGroupName] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Text mode state
  const [rawText, setRawText] = useState('');
  const [delimiter, setDelimiter] = useState<DelimiterOption>('auto');
  const [hasHeader, setHasHeader] = useState(false);

  // Table mode state
  const [tableRows, setTableRows] = useState<TableRowInput[]>(() => createEmptyTableRows(5));

  // File mode state
  const [fileName, setFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileIsJson, setFileIsJson] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // HSK level filter state (empty set means all detected levels enabled)
  const [selectedHskLevels, setSelectedHskLevels] = useState<number[] | null>(null);

  const [formError, setFormError] = useState<string | null>(null);

  // Determine whether active source content is Official HSK format
  const activeSourceText = mode === 'text' ? rawText : mode === 'file' && !fileIsJson ? fileContent : '';
  const isOfficialHskDetected = useMemo(
    () => Boolean(activeSourceText && isOfficialHskText(activeSourceText)),
    [activeSourceText]
  );

  // First pass HSK parse (without level filter) to discover available levels & counts
  const fullHskResult = useMemo(() => {
    if (!isOfficialHskDetected) return null;
    return parseOfficialHskText(activeSourceText);
  }, [isOfficialHskDetected, activeSourceText]);

  const availableHskLevels = useMemo(() => {
    if (!fullHskResult) return [];
    return Object.keys(fullHskResult.levelCounts)
      .map(Number)
      .sort((a, b) => a - b);
  }, [fullHskResult]);

  const activeHskLevels = useMemo(() => {
    if (!isOfficialHskDetected) return [];
    if (selectedHskLevels === null) return availableHskLevels;
    return selectedHskLevels.filter((lvl) => availableHskLevels.includes(lvl));
  }, [isOfficialHskDetected, selectedHskLevels, availableHskLevels]);

  const parsedResult: (ParsedImportResult & { hskRows?: HskParsedWordRow[] }) = useMemo(() => {
    if (isOfficialHskDetected && fullHskResult) {
      const levelSet = new Set(activeHskLevels);
      const filteredRows = fullHskResult.rows.filter((r) => levelSet.has(r.hskLevel));
      return {
        rows: filteredRows,
        hskRows: filteredRows,
        skippedLines: fullHskResult.skippedLines,
        detectedDelimiter: 'official-hsk',
      };
    }

    if (mode === 'text') {
      return parseDelimitedText(rawText, { delimiter, hasHeader });
    }
    if (mode === 'table') {
      return parseTableRows(tableRows);
    }
    if (!fileContent) {
      return { rows: [], skippedLines: [], detectedDelimiter: 'none' };
    }
    return fileIsJson
      ? parseJsonImport(fileContent)
      : parseDelimitedText(fileContent, { delimiter: 'auto' });
  }, [
    isOfficialHskDetected,
    fullHskResult,
    activeHskLevels,
    mode,
    rawText,
    delimiter,
    hasHeader,
    tableRows,
    fileContent,
    fileIsJson,
  ]);

  // Precompute existing hanzi Sets in O(M) for O(1) duplicate checks across 1000+ rows
  const existingHanziByGroupId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of existingCards) {
      let set = map.get(c.groupId);
      if (!set) {
        set = new Set<string>();
        map.set(c.groupId, set);
      }
      set.add(c.hanzi.trim());
    }
    return map;
  }, [existingCards]);

  const hskGroupIdByLevel = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of groups) {
      const m = g.name.match(/^HSK\s*Level\s*(\d+)$/i);
      if (m) map.set(Number(m[1]), g.id);
    }
    return map;
  }, [groups]);

  const isRowDuplicate = (row: ParsedWordRow & { hskLevel?: number }): boolean => {
    if (!skipDuplicates) return false;
    if (targetSelection === 'new') return false;
    if (targetSelection === 'split-hsk' && row.hskLevel) {
      const gid = hskGroupIdByLevel.get(row.hskLevel);
      if (!gid) return false;
      return existingHanziByGroupId.get(gid)?.has(row.hanzi.trim()) ?? false;
    }
    return existingHanziByGroupId.get(selectedGroupId)?.has(row.hanzi.trim()) ?? false;
  };

  const duplicateCount = useMemo(() => {
    if (!skipDuplicates) return 0;
    let count = 0;
    for (const r of parsedResult.rows) {
      if (isRowDuplicate(r as ParsedWordRow & { hskLevel?: number })) {
        count += 1;
      }
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedResult.rows, existingHanziByGroupId, hskGroupIdByLevel, skipDuplicates, targetSelection, selectedGroupId]);

  const importableCount = Math.max(0, parsedResult.rows.length - duplicateCount);

  if (!isOpen) return null;

  const processLoadedText = (name: string, text: string) => {
    setFileName(name);
    const isJson =
      name.toLowerCase().endsWith('.json') ||
      text.trim().startsWith('[') ||
      text.trim().startsWith('{');
    setFileIsJson(isJson);
    setFileContent(text);
    setSelectedHskLevels(null);
    if (!isJson && isOfficialHskText(text)) {
      setTargetSelection('split-hsk');
    }
  };

  const handleFileLoad = async (file: File) => {
    setFormError(null);
    setIsLoadingFile(true);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        const buffer = await file.arrayBuffer();
        const extracted = await extractTextFromPdfBuffer(buffer);
        processLoadedText(file.name, extracted.text);
      } else {
        const text = await file.text();
        processLoadedText(file.name, text);
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? `Could not read file: ${err.message}`
          : 'Could not extract text from the selected file.'
      );
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleLoadOfficialHskPdf = async () => {
    setFormError(null);
    setIsLoadingFile(true);
    setMode('file');
    try {
      const response = await fetch(OFFICIAL_HSK_PDF_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const extracted = await extractTextFromPdfBuffer(buffer);
      processLoadedText('Official HSK 1–3 Vocabulary (1000 words).pdf', extracted.text);
    } catch {
      setFormError('Failed to load the bundled Official HSK 1–3 PDF example.');
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleTableCellChange = (
    rowIndex: number,
    field: keyof TableRowInput,
    value: string
  ) => {
    setTableRows((prev) =>
      prev.map((row, idx) => (idx === rowIndex ? { ...row, [field]: value } : row))
    );
  };

  const handleTablePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRow: number,
    startColIndex: number
  ) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted.includes('\t') && !pasted.includes('\n')) return;

    e.preventDefault();
    const fields: (keyof TableRowInput)[] = ['hanzi', 'pinyin', 'translation', 'notes'];
    const lines = pasted.split(/\r?\n/).filter((l) => l.length > 0);

    setTableRows((prev) => {
      const next = [...prev];
      while (next.length < startRow + lines.length) {
        next.push({ hanzi: '', pinyin: '', translation: '', notes: '' });
      }
      lines.forEach((line, offset) => {
        const cols = line.split('\t');
        const targetRow = { ...next[startRow + offset] };
        cols.forEach((val, colOffset) => {
          const field = fields[startColIndex + colOffset];
          if (field) {
            targetRow[field] = val.trim();
          }
        });
        next[startRow + offset] = targetRow;
      });
      return next;
    });
  };

  const handleConvertPinyinInCurrentMode = () => {
    if (mode === 'text') {
      setRawText((prev) => convertNumberedPinyinToMarks(prev));
    } else if (mode === 'table') {
      setTableRows((prev) =>
        prev.map((row) => ({
          ...row,
          pinyin: convertNumberedPinyinToMarks(row.pinyin),
        }))
      );
    }
  };

  const toggleHskLevel = (level: number) => {
    const current = new Set(activeHskLevels);
    if (current.has(level)) {
      current.delete(level);
    } else {
      current.add(level);
    }
    setSelectedHskLevels(Array.from(current).sort((a, b) => a - b));
  };

  const handleSubmit = () => {
    setFormError(null);
    if (targetSelection === 'new' && !newGroupName.trim()) {
      setFormError('Please enter a name for the new word bank group.');
      return;
    }
    if (targetSelection === 'existing' && !selectedGroupId) {
      setFormError('Please select a target word bank group.');
      return;
    }
    if (importableCount === 0) {
      setFormError('No valid new words to import. Select a level or add at least one word.');
      return;
    }

    onConfirmImport({
      rows: parsedResult.rows,
      targetGroupId: selectedGroupId,
      newGroupName: targetSelection === 'new' ? newGroupName.trim() : undefined,
      splitByHskLevel: targetSelection === 'split-hsk',
      skipDuplicates,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 id="import-modal-title" className="text-lg font-semibold text-slate-900">
              Import Word List
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Import from CSV/TSV/TXT/JSON/Official HSK PDF files, a spreadsheet table, or pasted text.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import modal"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Step 1: Target Word Bank Group */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-2">
                Destination Word Bank Group
              </span>
              <div className="inline-flex flex-wrap p-1 bg-slate-100 rounded-lg border border-slate-200 gap-1">
                <button
                  type="button"
                  onClick={() => setTargetSelection('existing')}
                  disabled={groups.length === 0}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    targetSelection === 'existing'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Existing Group
                </button>
                <button
                  type="button"
                  onClick={() => setTargetSelection('new')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    targetSelection === 'new'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Create New Group
                </button>
                {isOfficialHskDetected && (
                  <button
                    type="button"
                    onClick={() => setTargetSelection('split-hsk')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                      targetSelection === 'split-hsk'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Split by HSK Level
                  </button>
                )}
              </div>
            </div>

            <div>
              {targetSelection === 'existing' ? (
                <div>
                  <label
                    htmlFor="import-target-group"
                    className="block text-xs font-medium text-slate-700 mb-2"
                  >
                    Select Group
                  </label>
                  <select
                    id="import-target-group"
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="w-full h-10 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : targetSelection === 'new' ? (
                <div>
                  <label
                    htmlFor="import-new-group-name"
                    className="block text-xs font-medium text-slate-700 mb-2"
                  >
                    New Group Name
                  </label>
                  <input
                    id="import-new-group-name"
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Official HSK 1–3"
                    className="w-full h-10 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              ) : (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                  <p className="text-xs font-medium text-blue-900">
                    Auto-creates or updates separate groups per level
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    {activeHskLevels.length > 0
                      ? activeHskLevels.map((l) => `HSK Level ${l}`).join(' · ')
                      : 'Select at least one HSK level below'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Import Source Mode Tabs */}
          <div>
            <div
              role="tablist"
              aria-label="Import source type"
              className="flex items-center gap-2 border-b border-slate-200 pb-3"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'file'}
                onClick={() => setMode('file')}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mode === 'file'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>From File / HSK PDF</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={mode === 'text'}
                onClick={() => setMode('text')}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mode === 'text'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                <span>From Text</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={mode === 'table'}
                onClick={() => setMode('table')}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mode === 'table'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Table2 className="w-4 h-4" aria-hidden="true" />
                <span>From Table</span>
              </button>
            </div>

            {/* FILE / HSK PDF IMPORT PANEL */}
            {mode === 'file' && (
              <div className="mt-3 space-y-2.5">
                {/* Official HSK PDF Example Callout */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <BookOpen className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Official HSK 3.0 Word Bank (Levels 1–3 PDF)
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Load the built-in 1,000-word Official HSK 1–3 PDF list with automatic pinyin, part of speech, and English translations.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={OFFICIAL_HSK_PDF_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg whitespace-nowrap transition-colors"
                    >
                      <span>View PDF</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      disabled={isLoadingFile}
                      onClick={() => void handleLoadOfficialHskPdf()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg whitespace-nowrap transition-colors"
                    >
                      {isLoadingFile ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>Load Official HSK 1–3 PDF</span>
                    </button>
                  </div>
                </div>

                {/* Drag & Drop / File Picker */}
                <input
                  ref={fileInputRef}
                  id="import-file-input"
                  type="file"
                  accept=".pdf,.csv,.tsv,.txt,.json,application/pdf,text/csv,text/tab-separated-values,text/plain,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileLoad(file);
                  }}
                  className="sr-only"
                />

                {fileName && !isLoadingFile ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(false);
                      const file = e.dataTransfer.files[0];
                      if (file) void handleFileLoad(file);
                    }}
                    className={`border rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                      isDraggingFile
                        ? 'border-blue-500 bg-blue-50/50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span className="text-xs font-medium text-slate-900 truncate">
                        Loaded: {fileName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label
                        htmlFor="import-file-input"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer transition-colors"
                      >
                        Replace File
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setFileName('');
                          setFileContent('');
                          setFileIsJson(false);
                          setSelectedHskLevels(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(false);
                      const file = e.dataTransfer.files[0];
                      if (file) void handleFileLoad(file);
                    }}
                    className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                      isDraggingFile
                        ? 'border-blue-500 bg-blue-50/50'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isLoadingFile ? (
                      <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" aria-hidden="true" />
                    ) : (
                      <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" aria-hidden="true" />
                    )}
                    <p className="text-sm font-medium text-slate-900">
                      {isLoadingFile
                        ? 'Extracting word list from file...'
                        : 'Upload an Official HSK PDF, CSV, TSV, TXT, or JSON file'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Drag and drop here, or browse from your device. Supports official HSK tables (序号 / 等级 / 词语 / 拼音 / 词性) and standard 3-column lists.
                    </p>
                    <div className="mt-3">
                      <label
                        htmlFor="import-file-input"
                        className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                      >
                        Select File
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TEXT IMPORT PANEL */}
            {mode === 'text' && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {!isOfficialHskDetected && (
                      <>
                        <div className="flex items-center gap-2">
                          <label htmlFor="text-delimiter" className="text-xs font-medium text-slate-600">
                            Delimiter
                          </label>
                          <select
                            id="text-delimiter"
                            value={delimiter}
                            onChange={(e) => setDelimiter(e.target.value as DelimiterOption)}
                            className="h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            <option value="auto">Auto-detect</option>
                            <option value="tab">Tab</option>
                            <option value="comma">Comma (,)</option>
                            <option value="pipe">Pipe (|)</option>
                            <option value="semicolon">Semicolon (;)</option>
                            <option value="dash">Dash ( - )</option>
                          </select>
                        </div>

                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hasHeader}
                            onChange={(e) => setHasHeader(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                          />
                          <span>First line is header</span>
                        </label>
                      </>
                    )}
                    {isOfficialHskDetected && (
                      <span className="text-xs font-medium text-blue-700">
                        Official HSK Table Format Detected
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConvertPinyinInCurrentMode}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                    >
                      <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Convert Tone Numbers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRawText(SAMPLE_HSK_TEXT);
                        setSelectedHskLevels(null);
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                    >
                      Load HSK Sample
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRawText(SAMPLE_TEXT);
                        setSelectedHskLevels(null);
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                    >
                      Load Sample
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="import-raw-textarea" className="sr-only">
                    Paste word list text
                  </label>
                  <textarea
                    id="import-raw-textarea"
                    rows={6}
                    value={rawText}
                    onChange={(e) => {
                      setRawText(e.target.value);
                      setSelectedHskLevels(null);
                    }}
                    placeholder={`Paste standard lists OR copied Official HSK tables:\n你好 | nǐ hǎo | hello\n谢谢, xièxie, thank you\n序号 等级 词语 拼音 词性\n1 1 爱 ài 动`}
                    className="w-full p-3 text-sm font-mono text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>
              </div>
            )}

            {/* TABLE IMPORT PANEL */}
            {mode === 'table' && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-600">
                    Type rows directly or paste cells from Excel / Google Sheets into any field.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConvertPinyinInCurrentMode}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                    >
                      <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Convert Tone Numbers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableRows((prev) => [...prev, ...createEmptyTableRows(3)])}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Add 3 Rows</span>
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-2 px-3 w-10">#</th>
                        <th className="py-2 px-3">Hanzi (Front)</th>
                        <th className="py-2 px-3">Pinyin (Back)</th>
                        <th className="py-2 px-3">Translation (Back)</th>
                        <th className="py-2 px-3">Notes (Optional)</th>
                        <th className="py-2 px-2 w-10">
                          <span className="sr-only">Remove row</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tableRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-1.5 px-3 text-xs text-slate-400 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              aria-label={`Row ${idx + 1} Hanzi`}
                              value={row.hanzi}
                              onChange={(e) => handleTableCellChange(idx, 'hanzi', e.target.value)}
                              onPaste={(e) => handleTablePaste(e, idx, 0)}
                              placeholder="汉字"
                              className="w-full h-9 px-2.5 text-sm font-hanzi bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              aria-label={`Row ${idx + 1} Pinyin`}
                              value={row.pinyin}
                              onChange={(e) => handleTableCellChange(idx, 'pinyin', e.target.value)}
                              onPaste={(e) => handleTablePaste(e, idx, 1)}
                              placeholder="hànzì"
                              className="w-full h-9 px-2.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              aria-label={`Row ${idx + 1} Translation`}
                              value={row.translation}
                              onChange={(e) =>
                                handleTableCellChange(idx, 'translation', e.target.value)
                              }
                              onPaste={(e) => handleTablePaste(e, idx, 2)}
                              placeholder="Chinese character"
                              className="w-full h-9 px-2.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              aria-label={`Row ${idx + 1} Notes`}
                              value={row.notes ?? ''}
                              onChange={(e) => handleTableCellChange(idx, 'notes', e.target.value)}
                              onPaste={(e) => handleTablePaste(e, idx, 3)}
                              placeholder="Optional"
                              className="w-full h-9 px-2.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              aria-label={`Remove row ${idx + 1}`}
                              onClick={() =>
                                setTableRows((prev) =>
                                  prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                                )
                              }
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Official HSK Level Filter Bar (when HSK format is detected) */}
          {isOfficialHskDetected && fullHskResult && availableHskLevels.length > 0 && (
            <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-blue-900">
                  Official HSK Format Detected · Filter Levels to Import
                </p>
                <p className="text-xs text-blue-700 mt-0.5 tabular-nums">
                  {fullHskResult.rows.length} total official entries parsed across {availableHskLevels.length} level{availableHskLevels.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {availableHskLevels.map((lvl) => {
                  const isChecked = activeHskLevels.includes(lvl);
                  const count = fullHskResult.levelCounts[lvl] ?? 0;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      aria-pressed={isChecked}
                      onClick={() => toggleHskLevel(lvl)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors tabular-nums ${
                        isChecked
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span>HSK {lvl} ({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Live Preview & Warnings */}
          <div className="pt-3 border-t border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs text-slate-600 tabular-nums">
                <span className="font-semibold text-slate-900">
                  Preview: {importableCount} new word{importableCount === 1 ? '' : 's'} ready
                </span>
                {parsedResult.rows.length > 50 && (
                  <span>· Showing first 50 of {parsedResult.rows.length}</span>
                )}
                {duplicateCount > 0 && (
                  <span>· {duplicateCount} duplicate skipped</span>
                )}
                {parsedResult.skippedLines.length > 0 && (
                  <span className="text-amber-700">
                    · {parsedResult.skippedLines.length} line{parsedResult.skippedLines.length === 1 ? '' : 's'} skipped
                  </span>
                )}
              </div>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Skip words already in target group</span>
              </label>
            </div>

            {parsedResult.rows.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                    <tr>
                      {isOfficialHskDetected && <th className="py-2 px-3">Level</th>}
                      <th className="py-2 px-3">Hanzi</th>
                      <th className="py-2 px-3">Pinyin</th>
                      <th className="py-2 px-3">Translation</th>
                      <th className="py-2 px-3">Notes</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedResult.rows.slice(0, 50).map((row, i) => {
                      const hskRow = row as HskParsedWordRow;
                      const isDup = isRowDuplicate(hskRow);
                      return (
                        <tr key={i} className={isDup ? 'opacity-50' : ''}>
                          {isOfficialHskDetected && (
                            <td className="py-1.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                              HSK {hskRow.rawLevel}
                            </td>
                          )}
                          <td className="py-1.5 px-3 font-hanzi text-sm text-slate-900 whitespace-nowrap">
                            {row.hanzi}
                          </td>
                          <td className="py-1.5 px-3 text-slate-700 whitespace-nowrap">
                            {row.pinyin || '—'}
                          </td>
                          <td className="py-1.5 px-3 text-slate-700">{row.translation}</td>
                          <td className="py-1.5 px-3 text-slate-500">{row.notes || '—'}</td>
                          <td className="py-1.5 px-3 whitespace-nowrap">
                            {isDup ? (
                              <span className="text-slate-500">Duplicate</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                <Check className="w-3 h-3" aria-hidden="true" />
                                Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {parsedResult.skippedLines.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Skipped lines</span>
                </div>
                {parsedResult.skippedLines.slice(0, 3).map((s) => (
                  <p key={s.lineNumber} className="pl-5">
                    Line {s.lineNumber}: {s.reason} ({s.raw})
                  </p>
                ))}
              </div>
            )}

            {formError && (
              <div
                role="alert"
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-700"
              >
                {formError}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
          >
            Import {importableCount} Word{importableCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
