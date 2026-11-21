import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
} from 'lucide-react';
import { ReviewLogEntry, WordCard, WordGroup } from '../types/flashcard';
import {
  calculateGroupStats,
  getCardAccuracy,
  isCardMastered,
  sortCardsByFewestRightFirst,
} from '../utils/scheduler';

interface StatisticsViewProps {
  groups: WordGroup[];
  cards: WordCard[];
  reviewLog: ReviewLogEntry[];
  onStudyGroup: (groupId: string | 'all') => void;
  onResetAllStats: () => void;
}

export function StatisticsView({
  groups,
  cards,
  reviewLog,
  onStudyGroup,
  onResetAllStats,
}: StatisticsViewProps) {
  const [groupFilter, setGroupFilter] = useState<string | 'all'>('all');
  const [confirmReset, setConfirmReset] = useState(false);

  const overallStats = useMemo(() => calculateGroupStats(cards, 'all'), [cards]);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) map.set(g.id, g.name);
    return map;
  }, [groups]);

  const rankedWords = useMemo(() => {
    const scoped =
      groupFilter === 'all' ? cards : cards.filter((c) => c.groupId === groupFilter);
    return sortCardsByFewestRightFirst(scoped);
  }, [cards, groupFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Learning Statistics
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Track recall accuracy across word banks. Words with fewer right answers are prioritized first in Study.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {confirmReset ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg">
              <span className="text-xs font-medium text-rose-800">Reset all card counts?</span>
              <button
                type="button"
                onClick={() => {
                  onResetAllStats();
                  setConfirmReset(false);
                }}
                className="px-2.5 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-2 py-1 text-xs text-slate-700 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 h-10 px-3.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap transition-colors"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Reset Stats</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onStudyGroup(groupFilter)}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap transition-colors"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            <span>Study Weakest First</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Vocabulary</p>
          <p className="text-3xl font-semibold text-slate-900 mt-1">{overallStats.totalCards}</p>
          <p className="text-xs text-slate-500 mt-1">
            {overallStats.unreviewedCount} never reviewed
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Reviews</p>
          <p className="text-3xl font-semibold text-slate-900 mt-1">
            {overallStats.totalReviews}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {overallStats.totalRight} right · {overallStats.totalWrong} wrong
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Overall Accuracy</p>
          <p className="text-3xl font-semibold text-blue-700 mt-1">
            {overallStats.accuracyPercent}%
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {reviewLog.length} logged swipes this device
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Mastered Words</p>
          <p className="text-3xl font-semibold text-emerald-700 mt-1">
            {overallStats.masteredCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            3+ right answers & majority correct
          </p>
        </div>
      </div>

      {/* Per-Group Mastery Breakdown */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Word Bank Group Progress</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4 sm:px-6 whitespace-nowrap">Word Bank Group</th>
                <th className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">Words</th>
                <th className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">Mastered</th>
                <th className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">Reviews</th>
                <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap">Accuracy</th>
                <th className="py-2.5 px-4 sm:px-6 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm tabular-nums">
              {groups.map((group) => {
                const stats = calculateGroupStats(cards, group.id);
                return (
                  <tr key={group.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 sm:px-6 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{group.name}</span>
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right font-mono text-xs text-slate-700">
                      {stats.totalCards}
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right font-mono text-xs text-emerald-700">
                      {stats.masteredCount}
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right font-mono text-xs text-slate-700">
                      {stats.totalReviews}
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="flex items-center gap-3 min-w-[120px]">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${stats.accuracyPercent}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-slate-700 w-9 text-right">
                          {stats.totalReviews === 0 ? '—' : `${stats.accuracyPercent}%`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 sm:px-6 text-right">
                      <button
                        type="button"
                        onClick={() => onStudyGroup(group.id)}
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline whitespace-nowrap"
                      >
                        Study Group
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Word-by-Word Priority Ranking (Fewest Right Answers First) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Study Priority Ranking (Fewest Right Answers First)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              This exact order determines which cards appear first when you open Study.
            </p>
          </div>
          <select
            aria-label="Filter word ranking by group"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
          >
            <option value="all">All Groups ({cards.length})</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-6 w-12">Order</th>
                <th className="py-2.5 px-3">Hanzi</th>
                <th className="py-2.5 px-3">Pinyin</th>
                <th className="py-2.5 px-3">Translation</th>
                <th className="py-2.5 px-3">Group</th>
                <th className="py-2.5 px-3 text-right">Right</th>
                <th className="py-2.5 px-3 text-right">Wrong</th>
                <th className="py-2.5 px-3 text-right">Accuracy</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm tabular-nums">
              {rankedWords.map((card, index) => {
                const acc = getCardAccuracy(card);
                const mastered = isCardMastered(card);
                const needsPractice =
                  card.wrongCount > card.rightCount || (card.rightCount === 0 && card.wrongCount > 0);
                return (
                  <tr key={card.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-6 font-mono text-xs text-slate-400">
                      {index + 1}
                    </td>
                    <td className="py-2.5 px-3 font-hanzi text-base font-medium text-slate-900 whitespace-nowrap">
                      {card.hanzi}
                    </td>
                    <td className="py-2.5 px-3 text-blue-700 whitespace-nowrap">
                      {card.pinyin || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{card.translation}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                      {groupNameById.get(card.groupId) ?? '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold text-emerald-700">
                      {card.rightCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold text-rose-700">
                      {card.wrongCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-600">
                      {acc === null ? '—' : `${acc}%`}
                    </td>
                    <td className="py-2.5 px-6 whitespace-nowrap">
                      {mastered ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <Award className="w-3.5 h-3.5" aria-hidden="true" />
                          Mastered
                        </span>
                      ) : needsPractice ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          Needs Practice
                        </span>
                      ) : card.rightCount + card.wrongCount === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          Unreviewed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Learning
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
