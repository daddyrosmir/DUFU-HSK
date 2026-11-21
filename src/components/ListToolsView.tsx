import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  GitMerge,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { WordCard, WordGroup } from '../types/flashcard';
import { serializeToCsv, serializeToJson, serializeToTsv } from '../utils/importers';
import {
  convertNumberedPinyinToMarks,
  findDuplicates,
  normalizeCardText,
} from '../utils/listTools';

interface ListToolsViewProps {
  groups: WordGroup[];
  cards: WordCard[];
  onDeduplicateScope: (scopeGroupId: string | 'all') => number;
  onNormalizeScope: (scopeGroupId: string | 'all') => number;
  onConvertPinyinScope: (scopeGroupId: string | 'all') => number;
  onMergeGroups: (sourceGroupId: string, targetGroupId: string, deleteSource: boolean) => void;
}

function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ListToolsView({
  groups,
  cards,
  onDeduplicateScope,
  onNormalizeScope,
  onConvertPinyinScope,
  onMergeGroups,
}: ListToolsViewProps) {
  const [scopeGroupId, setScopeGroupId] = useState<string | 'all'>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Live Pinyin Tone Converter Scratchpad
  const [pinyinInput, setPinyinInput] = useState('ni3 hao3, huo3che1zhan4, lv4 cha2');
  const [copiedPinyin, setCopiedPinyin] = useState(false);

  // Merge groups state
  const [mergeSourceId, setMergeSourceId] = useState<string>(groups[1]?.id ?? groups[0]?.id ?? '');
  const [mergeTargetId, setMergeTargetId] = useState<string>(groups[0]?.id ?? '');
  const [deleteSourceAfterMerge, setDeleteSourceAfterMerge] = useState(false);

  // Clipboard export feedback
  const [copiedTsv, setCopiedTsv] = useState(false);

  const scopedCards = useMemo(
    () =>
      scopeGroupId === 'all' ? cards : cards.filter((c) => c.groupId === scopeGroupId),
    [cards, scopeGroupId]
  );

  const duplicateClusters = useMemo(
    () => findDuplicates(cards, scopeGroupId),
    [cards, scopeGroupId]
  );

  const cardsWithWhitespaceIssues = useMemo(
    () =>
      scopedCards.filter((card) => {
        const cleaned = normalizeCardText(card);
        return (
          cleaned.hanzi !== card.hanzi ||
          cleaned.pinyin !== card.pinyin ||
          cleaned.translation !== card.translation ||
          cleaned.notes !== card.notes
        );
      }),
    [scopedCards]
  );

  const cardsWithNumberedPinyin = useMemo(
    () =>
      scopedCards.filter(
        (card) => convertNumberedPinyinToMarks(card.pinyin) !== card.pinyin
      ),
    [scopedCards]
  );

  const convertedScratchpad = useMemo(
    () => convertNumberedPinyinToMarks(pinyinInput),
    [pinyinInput]
  );

  const scopeLabel =
    scopeGroupId === 'all'
      ? 'All Word Banks'
      : groups.find((g) => g.id === scopeGroupId)?.name ?? 'Selected Group';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header + Scope Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Word List Tools
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Clean, deduplicate, convert tone numbers, merge groups, and export your Chinese vocabulary lists.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="tools-scope-select" className="text-xs font-medium text-slate-600">
            Target Scope
          </label>
          <select
            id="tools-scope-select"
            value={scopeGroupId}
            onChange={(e) => {
              setScopeGroupId(e.target.value);
              setFeedback(null);
            }}
            className="h-10 px-3 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Word Banks ({cards.length})</option>
            {groups.map((g) => {
              const count = cards.filter((c) => c.groupId === g.id).length;
              return (
                <option key={g.id} value={g.id}>
                  {g.name} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center justify-between gap-2"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <Check className="w-4 h-4" aria-hidden="true" />
            {feedback}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2x2 Grid of Word List Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tool 1: Duplicate Finder & Merger */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Duplicate Finder & Merger
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {duplicateClusters.length} duplicate group{duplicateClusters.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1.5">
              Detect identical Hanzi words inside {scopeLabel} and merge them while preserving total Right and Wrong review counts.
            </p>

            {duplicateClusters.length > 0 ? (
              <ul className="mt-4 divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                {duplicateClusters.map((cluster) => (
                  <li
                    key={cluster.hanziKey}
                    className="px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="font-hanzi text-sm font-medium text-slate-900">
                      {cluster.hanziKey}
                    </span>
                    <span className="text-slate-600 tabular-nums">
                      {cluster.cards.length} entries
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-xs text-slate-500 py-3 px-3 bg-slate-50 rounded-lg border border-slate-100">
                No duplicate Hanzi entries detected in {scopeLabel}.
              </p>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={duplicateClusters.length === 0}
              onClick={() => {
                const removed = onDeduplicateScope(scopeGroupId);
                setFeedback(
                  removed > 0
                    ? `Merged and removed ${removed} duplicate card${removed === 1 ? '' : 's'} while preserving statistics.`
                    : 'No duplicates needed merging within the same group.'
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>Deduplicate & Merge Stats</span>
            </button>
          </div>
        </section>

        {/* Tool 2: Pinyin Tone Number Converter */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Pinyin Tone Mark Converter
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {cardsWithNumberedPinyin.length} card{cardsWithNumberedPinyin.length === 1 ? '' : 's'} convertible
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1.5">
              Convert numbered pinyin (e.g. <span className="font-mono">ni3 hao3</span>,{' '}
              <span className="font-mono">lv4</span>) into standard tone diacritics.
            </p>

            {/* Live Scratchpad */}
            <div className="mt-4 space-y-2">
              <label htmlFor="pinyin-scratchpad-input" className="block text-xs font-medium text-slate-600">
                Quick Scratchpad
              </label>
              <input
                id="pinyin-scratchpad-input"
                type="text"
                value={pinyinInput}
                onChange={(e) => setPinyinInput(e.target.value)}
                className="w-full h-9 px-3 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-sm font-medium text-blue-700 truncate">
                  {convertedScratchpad || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(convertedScratchpad);
                    setCopiedPinyin(true);
                    window.setTimeout(() => setCopiedPinyin(false), 1500);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{copiedPinyin ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={cardsWithNumberedPinyin.length === 0}
              onClick={() => {
                const count = onConvertPinyinScope(scopeGroupId);
                setFeedback(
                  `Converted numbered pinyin to tone marks on ${count} card${count === 1 ? '' : 's'}.`
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors"
            >
              <Wand2 className="w-4 h-4" aria-hidden="true" />
              <span>Batch Convert {scopeLabel}</span>
            </button>
          </div>
        </section>

        {/* Tool 3: Whitespace Normalizer & Group Merger */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Clean Formatting & Merge Groups
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {cardsWithWhitespaceIssues.length} spacing issue{cardsWithWhitespaceIssues.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1.5">
              Trim stray spaces across cards or combine two word bank groups together.
            </p>
            <button
              type="button"
              disabled={cardsWithWhitespaceIssues.length === 0}
              onClick={() => {
                const updated = onNormalizeScope(scopeGroupId);
                setFeedback(`Normalized whitespace on ${updated} card${updated === 1 ? '' : 's'}.`);
              }}
              className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Normalize Whitespace ({cardsWithWhitespaceIssues.length})</span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-sm font-medium text-slate-900">Merge One Group Into Another</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="merge-source-select" className="block text-xs text-slate-600 mb-1">
                  Source Group
                </label>
                <select
                  id="merge-source-select"
                  value={mergeSourceId}
                  onChange={(e) => setMergeSourceId(e.target.value)}
                  className="w-full h-9 px-2.5 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="merge-target-select" className="block text-xs text-slate-600 mb-1">
                  Destination Group
                </label>
                <select
                  id="merge-target-select"
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="w-full h-9 px-2.5 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteSourceAfterMerge}
                  onChange={(e) => setDeleteSourceAfterMerge(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Delete source group after merge</span>
              </label>

              <button
                type="button"
                disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId}
                onClick={() => {
                  onMergeGroups(mergeSourceId, mergeTargetId, deleteSourceAfterMerge);
                  const srcName = groups.find((g) => g.id === mergeSourceId)?.name ?? 'source';
                  const dstName = groups.find((g) => g.id === mergeTargetId)?.name ?? 'destination';
                  setFeedback(`Merged "${srcName}" into "${dstName}".`);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors"
              >
                <GitMerge className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Merge Groups</span>
              </button>
            </div>
          </div>
        </section>

        {/* Tool 4: Export & Clipboard */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Export Word List ({scopeLabel})
            </h2>
            <p className="text-sm text-slate-600 mt-1.5">
              Download <span className="tabular-nums font-medium">{scopedCards.length}</span> word
              {scopedCards.length === 1 ? '' : 's'} as CSV, tab-separated TSV (for spreadsheets), or full JSON backup with statistics.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={scopedCards.length === 0}
              onClick={() =>
                triggerFileDownload(
                  `hanzicard-${scopeGroupId}.csv`,
                  serializeToCsv(scopedCards),
                  'text/csv;charset=utf-8'
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              disabled={scopedCards.length === 0}
              onClick={() =>
                triggerFileDownload(
                  `hanzicard-${scopeGroupId}.tsv`,
                  serializeToTsv(scopedCards),
                  'text/tab-separated-values;charset=utf-8'
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Export TSV</span>
            </button>

            <button
              type="button"
              disabled={scopedCards.length === 0}
              onClick={() => {
                const relevantGroups =
                  scopeGroupId === 'all'
                    ? groups
                    : groups.filter((g) => g.id === scopeGroupId);
                triggerFileDownload(
                  `hanzicard-${scopeGroupId}.json`,
                  serializeToJson(scopedCards, relevantGroups),
                  'application/json;charset=utf-8'
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Export JSON</span>
            </button>

            <button
              type="button"
              disabled={scopedCards.length === 0}
              onClick={() => {
                void navigator.clipboard?.writeText(serializeToTsv(scopedCards));
                setCopiedTsv(true);
                window.setTimeout(() => setCopiedTsv(false), 1800);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              <span>{copiedTsv ? 'Copied TSV' : 'Copy Table to Clipboard'}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
