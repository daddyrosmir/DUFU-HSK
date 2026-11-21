import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  RotateCcw,
  RotateCw,
  Upload,
  X,
} from 'lucide-react';
import { SwipeDirection, WordCard, WordGroup } from '../types/flashcard';
import { buildStudyQueue, calculateGroupStats } from '../utils/scheduler';

interface StudyViewProps {
  groups: WordGroup[];
  cards: WordCard[];
  activeGroupId: string | 'all';
  onChangeActiveGroup: (groupId: string | 'all') => void;
  onSwipeCard: (cardId: string, direction: SwipeDirection) => void;
  onOpenImport: () => void;
  onGoToBanks: () => void;
}

interface SessionAttempt {
  cardId: string;
  hanzi: string;
  pinyin: string;
  result: SwipeDirection;
}

export function StudyView({
  groups,
  cards,
  activeGroupId,
  onChangeActiveGroup,
  onSwipeCard,
  onOpenImport,
  onGoToBanks,
}: StudyViewProps) {
  const [onlyUnmastered, setOnlyUnmastered] = useState(false);
  const [queueIds, setQueueIds] = useState<string[]>(() =>
    buildStudyQueue(cards, activeGroupId).map((c) => c.id)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionAttempts, setSessionAttempts] = useState<SessionAttempt[]>([]);
  const [exitDirection, setExitDirection] = useState<SwipeDirection | null>(null);

  // Pointer drag state for swipe gesture
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const didDragRef = useRef(false);
  const swipeLockRef = useRef(false);

  const cardById = useMemo(() => {
    const map = new Map<string, WordCard>();
    for (const c of cards) map.set(c.id, c);
    return map;
  }, [cards]);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) map.set(g.id, g.name);
    return map;
  }, [groups]);

  const startNewRound = useCallback(
    (overrideIds?: string[]) => {
      const ordered = overrideIds
        ? overrideIds
        : buildStudyQueue(cards, activeGroupId, { onlyUnmastered }).map((c) => c.id);
      setQueueIds(ordered);
      setCurrentIndex(0);
      setIsFlipped(false);
      setSessionAttempts([]);
      setExitDirection(null);
      setDragX(0);
      swipeLockRef.current = false;
    },
    [cards, activeGroupId, onlyUnmastered]
  );

  // Reset queue when active group or study scope changes
  useEffect(() => {
    startNewRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId, onlyUnmastered]);

  // Keep queue synchronized if cards are added or deleted while staying on Study view
  useEffect(() => {
    const validTargetCards = buildStudyQueue(cards, activeGroupId, { onlyUnmastered });
    const validSet = new Set(validTargetCards.map((c) => c.id));
    setQueueIds((prev) => {
      const existingValid = prev.filter((id) => validSet.has(id));
      const existingSet = new Set(existingValid);
      const newlyAdded = validTargetCards
        .filter((c) => !existingSet.has(c.id))
        .map((c) => c.id);
      if (existingValid.length === prev.length && newlyAdded.length === 0) {
        return prev;
      }
      return [...existingValid, ...newlyAdded];
    });
  }, [cards, activeGroupId, onlyUnmastered]);

  const activeQueueCards = useMemo(
    () =>
      queueIds
        .map((id) => cardById.get(id))
        .filter((c): c is WordCard => Boolean(c)),
    [queueIds, cardById]
  );

  const currentCard = activeQueueCards[currentIndex] ?? null;
  const isRoundComplete = activeQueueCards.length > 0 && currentIndex >= activeQueueCards.length;
  const groupStats = useMemo(
    () => calculateGroupStats(cards, activeGroupId),
    [cards, activeGroupId]
  );

  const commitSwipe = useCallback(
    (direction: SwipeDirection) => {
      if (!currentCard || swipeLockRef.current) return;
      swipeLockRef.current = true;
      setExitDirection(direction);
      setIsDragging(false);
      setDragX(direction === 'right' ? 360 : -360);

      window.setTimeout(() => {
        onSwipeCard(currentCard.id, direction);
        setSessionAttempts((prev) => [
          {
            cardId: currentCard.id,
            hanzi: currentCard.hanzi,
            pinyin: currentCard.pinyin,
            result: direction,
          },
          ...prev,
        ]);
        setCurrentIndex((prev) => prev + 1);
        setIsFlipped(false);
        setExitDirection(null);
        setDragX(0);
        swipeLockRef.current = false;
      }, 170);
    },
    [currentCard, onSwipeCard]
  );

  // Keyboard shortcuts: Space to flip, ArrowLeft for Forgot, ArrowRight for Remembered
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!currentCard || isRoundComplete) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        commitSwipe('right');
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        commitSwipe('left');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCard, isRoundComplete, commitSwipe]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (swipeLockRef.current || !currentCard) return;
    // Ignore drags starting directly on inner buttons if any
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    didDragRef.current = false;
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current || !isDragging) return;
    const dx = e.clientX - pointerStartRef.current.x;
    if (Math.abs(dx) > 8) {
      didDragRef.current = true;
    }
    setDragX(dx);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(pointerStartRef.current.pointerId);
    } catch {
      // ignore if capture was already released
    }
    const finalDx = dragX;
    pointerStartRef.current = null;
    setIsDragging(false);

    if (finalDx > 85) {
      commitSwipe('right');
    } else if (finalDx < -85) {
      commitSwipe('left');
    } else {
      setDragX(0);
      if (!didDragRef.current) {
        setIsFlipped((prev) => !prev);
      }
    }
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
    setIsDragging(false);
    setDragX(0);
  };

  const sessionRightCount = sessionAttempts.filter((a) => a.result === 'right').length;
  const sessionWrongCount = sessionAttempts.filter((a) => a.result === 'left').length;
  const sessionTotal = sessionAttempts.length;
  const sessionAccuracy =
    sessionTotal === 0 ? 0 : Math.round((sessionRightCount / sessionTotal) * 100);

  const missedIdsInRound = useMemo(() => {
    const ids = new Set<string>();
    for (const a of sessionAttempts) {
      if (a.result === 'left') ids.add(a.cardId);
    }
    return Array.from(ids);
  }, [sessionAttempts]);

  const upcomingCards = activeQueueCards.slice(currentIndex, currentIndex + 6);
  const progressPercent =
    activeQueueCards.length === 0
      ? 0
      : Math.min(100, Math.round((currentIndex / activeQueueCards.length) * 100));

  const dragIntent: SwipeDirection | null =
    dragX > 28 ? 'right' : dragX < -28 ? 'left' : null;
  const dragOpacity = Math.min(1, Math.max(0, (Math.abs(dragX) - 24) / 70));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Top Study Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Flashcard Revision
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Flip cards to check pinyin and translation. Cards with fewer right answers appear first.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="study-group-select" className="text-xs font-medium text-slate-600">
              Word Bank
            </label>
            <select
              id="study-group-select"
              value={activeGroupId}
              onChange={(e) => onChangeActiveGroup(e.target.value)}
              className="h-10 px-3 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Word Banks ({cards.length})</option>
              {groups.map((group) => {
                const count = cards.filter((c) => c.groupId === group.id).length;
                return (
                  <option key={group.id} value={group.id}>
                    {group.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setOnlyUnmastered(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                !onlyUnmastered
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Words
            </button>
            <button
              type="button"
              onClick={() => setOnlyUnmastered(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                onlyUnmastered
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Needs Practice
            </button>
          </div>

          <button
            type="button"
            onClick={() => startNewRound()}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 transition-colors"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Restart Queue</span>
          </button>
        </div>
      </div>

      {/* Two-Zone Sandbox Layout: Interactive Card Stage (left ~65%) + Live Queue & Stats (right ~35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 items-start">
        {/* Left Zone: Interactive Flashcard Stage */}
        <section aria-label="Flashcard deck" className="lg:col-span-7 xl:col-span-8">
          {/* Progress Strip */}
          {activeQueueCards.length > 0 && (
            <div className="max-w-[540px] mx-auto mb-5">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-2 tabular-nums">
                <span>
                  {isRoundComplete
                    ? `Completed ${activeQueueCards.length} of ${activeQueueCards.length}`
                    : `Card ${currentIndex + 1} of ${activeQueueCards.length}`}
                </span>
                <span>
                  Group accuracy: {groupStats.accuracyPercent}% ({groupStats.totalReviews} reviews)
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Empty State */}
          {activeQueueCards.length === 0 ? (
            <div className="max-w-[540px] mx-auto bg-white border border-slate-200 rounded-xl p-10 text-center">
              <h2 className="text-lg font-semibold text-slate-900">
                {onlyUnmastered
                  ? 'All words in this bank are mastered'
                  : 'No words in this word bank yet'}
              </h2>
              <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
                {onlyUnmastered
                  ? 'Switch to All Words to review everything again, or import new vocabulary.'
                  : 'Import a word list from a file, table, or pasted text, or add words directly in Word Banks.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {onlyUnmastered ? (
                  <button
                    type="button"
                    onClick={() => setOnlyUnmastered(false)}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Show All Words
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onOpenImport}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      <Upload className="w-4 h-4" aria-hidden="true" />
                      <span>Import Words</span>
                    </button>
                    <button
                      type="button"
                      onClick={onGoToBanks}
                      className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      Manage Word Banks
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : isRoundComplete ? (
            /* Round Complete Summary */
            <div className="max-w-[540px] mx-auto bg-white border border-slate-200 rounded-xl p-8 sm:p-10 text-center">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                Round Complete
              </p>
              <h2 className="text-2xl font-semibold text-slate-900 mt-2">
                {sessionAccuracy}% remembered this round
              </h2>
              <p className="text-sm text-slate-600 mt-2 tabular-nums">
                Remembered {sessionRightCount} · Forgot {sessionWrongCount} · Total {sessionTotal}
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => startNewRound()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  <span>Start Next Round (Fewest Right First)</span>
                </button>

                {missedIdsInRound.length > 0 && (
                  <button
                    type="button"
                    onClick={() => startNewRound(missedIdsInRound)}
                    className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    Review {missedIdsInRound.length} Missed Cards
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Active Two-Sided Swipeable Flashcard */
            <div className="max-w-[540px] mx-auto">
              <div
                data-testid="flashcard-stage"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                style={{
                  transform: `translate3d(${dragX}px, 0, 0) rotate(${dragX * 0.04}deg)`,
                  opacity: exitDirection ? 0 : 1,
                  transition: isDragging
                    ? 'none'
                    : 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 170ms ease-out',
                  touchAction: 'pan-y',
                }}
                className="relative select-none cursor-grab active:cursor-grabbing perspective-1200"
              >
                {/* Swipe Intent Stamp Overlays (dual-coded with icon + text) */}
                {dragIntent === 'right' && (
                  <div
                    style={{ opacity: dragOpacity }}
                    className="pointer-events-none absolute top-5 left-5 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-emerald-600 bg-emerald-50 text-emerald-700 font-semibold text-sm"
                  >
                    <Check className="w-4 h-4" aria-hidden="true" />
                    <span>Remembered</span>
                  </div>
                )}
                {dragIntent === 'left' && (
                  <div
                    style={{ opacity: dragOpacity }}
                    className="pointer-events-none absolute top-5 right-5 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-rose-600 bg-rose-50 text-rose-700 font-semibold text-sm"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                    <span>Forgot</span>
                  </div>
                )}

                {/* 3D Flippable Card Container */}
                <div
                  className={`relative w-full min-h-[340px] sm:min-h-[370px] preserve-3d transition-transform duration-300 ${
                    isFlipped ? 'rotate-y-180' : ''
                  }`}
                >
                  {/* FRONT SIDE: Hieroglyph (Hanzi) */}
                  <div
                    aria-hidden={isFlipped}
                    data-testid="card-front"
                    className="absolute inset-0 backface-hidden bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{groupNameById.get(currentCard.groupId) ?? 'Word Bank'}</span>
                      <span className="tabular-nums">
                        Right {currentCard.rightCount} · Wrong {currentCard.wrongCount}
                      </span>
                    </div>

                    <div className="my-auto py-6 text-center">
                      <p className="text-xs font-medium text-slate-400 mb-3">Front · Hanzi</p>
                      <div className="font-hanzi text-6xl sm:text-7xl font-bold text-slate-900 tracking-wide leading-tight">
                        {currentCard.hanzi}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100">
                      <span>Tap card or press Space to flip</span>
                      <span>Drag ← Forgot / Remembered →</span>
                    </div>
                  </div>

                  {/* BACK SIDE: Pinyin + Translation */}
                  <div
                    aria-hidden={!isFlipped}
                    data-testid="card-back"
                    className="absolute inset-0 backface-hidden rotate-y-180 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {groupNameById.get(currentCard.groupId) ?? 'Word Bank'} ·{' '}
                        <span className="font-hanzi text-slate-700 font-medium">
                          {currentCard.hanzi}
                        </span>
                      </span>
                      <span className="tabular-nums">
                        Right {currentCard.rightCount} · Wrong {currentCard.wrongCount}
                      </span>
                    </div>

                    <div className="my-auto py-4 text-center">
                      <p className="text-xs font-medium text-slate-400 mb-2">
                        Back · Pinyin & Translation
                      </p>
                      <div className="text-3xl sm:text-4xl font-semibold text-blue-700 tracking-tight">
                        {currentCard.pinyin || '—'}
                      </div>
                      <div className="text-xl sm:text-2xl font-medium text-slate-900 mt-4">
                        {currentCard.translation}
                      </div>
                      {currentCard.notes && (
                        <p className="text-sm text-slate-600 mt-4 max-w-md mx-auto pt-3 border-t border-slate-100">
                          {currentCard.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100">
                      <span>Swipe left if forgot · Swipe right if remembered</span>
                      <span>Space to flip</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Action Controls */}
              <div className="mt-6 grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => commitSwipe('left')}
                  className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 text-sm font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 hover:border-rose-300 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Forgot</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsFlipped((prev) => !prev)}
                  className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <RotateCw className="w-4 h-4" aria-hidden="true" />
                  <span>{isFlipped ? 'Show Front' : 'Flip Card'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => commitSwipe('right')}
                  className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 text-sm font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <span>Remembered</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right Zone: Priority Queue & Session Feedback */}
        <aside
          aria-label="Study queue and session summary"
          className="lg:col-span-5 xl:col-span-4 space-y-6"
        >
          {/* Current Session Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900">Current Session</h2>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 tabular-nums">
              <div>
                <p className="text-xs text-slate-500">Remembered</p>
                <p className="text-xl font-semibold text-emerald-700 mt-0.5">{sessionRightCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Forgot</p>
                <p className="text-xl font-semibold text-rose-700 mt-0.5">{sessionWrongCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Accuracy</p>
                <p className="text-xl font-semibold text-slate-900 mt-0.5">{sessionAccuracy}%</p>
              </div>
            </div>
          </div>

          {/* Upcoming Queue Order (Fewest Right Answers First) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Up Next (Fewest Right First)
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {Math.max(0, activeQueueCards.length - currentIndex)} left
              </span>
            </div>

            {upcomingCards.length === 0 ? (
              <p className="text-xs text-slate-500 mt-4">
                No cards remaining in this pass.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {upcomingCards.map((card, idx) => (
                  <li
                    key={card.id}
                    className={`py-2.5 flex items-center justify-between gap-3 text-sm ${
                      idx === 0 ? 'font-medium text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-slate-400 w-4 tabular-nums">
                        {currentIndex + idx + 1}
                      </span>
                      <span className="font-hanzi text-base text-slate-900 shrink-0">
                        {card.hanzi}
                      </span>
                      <span className="text-xs text-slate-500 truncate">
                        {idx === 0 ? 'Active card' : groupNameById.get(card.groupId)}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                      {card.rightCount} right · {card.wrongCount} wrong
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Answers in Session */}
          {sessionAttempts.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900">Recent Answers</h2>
              <ul className="mt-3 divide-y divide-slate-100">
                {sessionAttempts.slice(0, 5).map((attempt, index) => (
                  <li
                    key={`${attempt.cardId}-${index}`}
                    className="py-2 flex items-center justify-between gap-2 text-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-hanzi text-base text-slate-900">
                        {attempt.hanzi}
                      </span>
                      <span className="text-xs text-slate-500 truncate">{attempt.pinyin}</span>
                    </div>
                    {attempt.result === 'right' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 shrink-0">
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        Remembered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 shrink-0">
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                        Forgot
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
