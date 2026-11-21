import { GroupStatsSummary, SwipeDirection, WordCard } from '../types/flashcard';

/**
 * Sorts cards so those with fewer right answers appear first.
 * Tie-breakers:
 * 1. Fewer right answers (ascending)
 * 2. More wrong answers (descending — prioritize troublesome cards)
 * 3. Least recently reviewed / never reviewed first (ascending)
 * 4. Older creation time (ascending, deterministic)
 */
export function sortCardsByFewestRightFirst(cards: WordCard[]): WordCard[] {
  return [...cards].sort((a, b) => {
    if (a.rightCount !== b.rightCount) {
      return a.rightCount - b.rightCount;
    }
    if (a.wrongCount !== b.wrongCount) {
      return b.wrongCount - a.wrongCount;
    }
    const aReviewed = a.lastReviewedAt ?? 0;
    const bReviewed = b.lastReviewedAt ?? 0;
    if (aReviewed !== bReviewed) {
      return aReviewed - bReviewed;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Builds the ordered study queue for a specific group or all groups.
 */
export function buildStudyQueue(
  cards: WordCard[],
  groupId: string | 'all',
  options?: { onlyUnmastered?: boolean }
): WordCard[] {
  let filtered =
    groupId === 'all' ? cards : cards.filter((card) => card.groupId === groupId);

  if (options?.onlyUnmastered) {
    filtered = filtered.filter((card) => !isCardMastered(card));
  }

  return sortCardsByFewestRightFirst(filtered);
}

/**
 * A card is considered mastered when it has at least 3 right answers
 * and more right answers than wrong answers.
 */
export function isCardMastered(card: WordCard): boolean {
  return card.rightCount >= 3 && card.rightCount > card.wrongCount;
}

/**
 * Updates a card's review statistics after a swipe left (forgot) or right (remembered).
 */
export function recordSwipeAnswer(
  card: WordCard,
  direction: SwipeDirection,
  now: number = Date.now()
): WordCard {
  return {
    ...card,
    rightCount: direction === 'right' ? card.rightCount + 1 : card.rightCount,
    wrongCount: direction === 'left' ? card.wrongCount + 1 : card.wrongCount,
    lastReviewedAt: now,
  };
}

/**
 * Calculates aggregate statistics for a set of cards (optionally scoped to one group).
 */
export function calculateGroupStats(
  cards: WordCard[],
  groupId?: string | 'all'
): GroupStatsSummary {
  const scoped =
    !groupId || groupId === 'all'
      ? cards
      : cards.filter((card) => card.groupId === groupId);

  let totalRight = 0;
  let totalWrong = 0;
  let unreviewedCount = 0;
  let masteredCount = 0;

  for (const card of scoped) {
    totalRight += card.rightCount;
    totalWrong += card.wrongCount;
    if (card.rightCount === 0 && card.wrongCount === 0) {
      unreviewedCount += 1;
    }
    if (isCardMastered(card)) {
      masteredCount += 1;
    }
  }

  const totalReviews = totalRight + totalWrong;
  const accuracyPercent =
    totalReviews === 0 ? 0 : Math.round((totalRight / totalReviews) * 100);

  return {
    totalCards: scoped.length,
    totalRight,
    totalWrong,
    totalReviews,
    accuracyPercent,
    unreviewedCount,
    masteredCount,
  };
}

/**
 * Computes individual card accuracy percentage (null if unreviewed).
 */
export function getCardAccuracy(card: WordCard): number | null {
  const total = card.rightCount + card.wrongCount;
  if (total === 0) return null;
  return Math.round((card.rightCount / total) * 100);
}
