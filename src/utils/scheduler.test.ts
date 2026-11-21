import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudyQueue,
  calculateGroupStats,
  getCardAccuracy,
  recordSwipeAnswer,
  sortCardsByFewestRightFirst,
} from './scheduler';
import { WordCard } from '../types/flashcard';

function makeCard(overrides: Partial<WordCard> & { id: string }): WordCard {
  return {
    hanzi: '词',
    pinyin: 'cí',
    translation: 'word',
    groupId: 'g1',
    rightCount: 0,
    wrongCount: 0,
    lastReviewedAt: null,
    createdAt: 1000,
    ...overrides,
  };
}

test('sortCardsByFewestRightFirst orders fewer right answers first, then more wrong answers', () => {
  const cards = [
    makeCard({ id: 'c3', rightCount: 3, wrongCount: 0 }),
    makeCard({ id: 'c0-no-wrong', rightCount: 0, wrongCount: 0 }),
    makeCard({ id: 'c1', rightCount: 1, wrongCount: 4 }),
    makeCard({ id: 'c0-2-wrong', rightCount: 0, wrongCount: 2 }),
  ];

  const sorted = sortCardsByFewestRightFirst(cards);
  assert.deepEqual(
    sorted.map((c) => c.id),
    ['c0-2-wrong', 'c0-no-wrong', 'c1', 'c3']
  );
});

test('recordSwipeAnswer updates rightCount on right swipe and wrongCount on left swipe', () => {
  const card = makeCard({ id: 'c1', rightCount: 1, wrongCount: 2 });

  const afterRight = recordSwipeAnswer(card, 'right', 5000);
  assert.equal(afterRight.rightCount, 2);
  assert.equal(afterRight.wrongCount, 2);
  assert.equal(afterRight.lastReviewedAt, 5000);

  const afterLeft = recordSwipeAnswer(card, 'left', 6000);
  assert.equal(afterLeft.rightCount, 1);
  assert.equal(afterLeft.wrongCount, 3);
  assert.equal(afterLeft.lastReviewedAt, 6000);
});

test('buildStudyQueue filters by groupId and preserves fewest-right-first ordering', () => {
  const cards = [
    makeCard({ id: 'a', groupId: 'g1', rightCount: 2 }),
    makeCard({ id: 'b', groupId: 'g2', rightCount: 0 }),
    makeCard({ id: 'c', groupId: 'g1', rightCount: 0 }),
  ];

  const g1Queue = buildStudyQueue(cards, 'g1');
  assert.deepEqual(
    g1Queue.map((c) => c.id),
    ['c', 'a']
  );

  const allQueue = buildStudyQueue(cards, 'all');
  assert.equal(allQueue.length, 3);
  assert.equal(allQueue[0].rightCount, 0);
});

test('calculateGroupStats computes totals, accuracy, unreviewed, and mastered counts', () => {
  const cards = [
    makeCard({ id: '1', groupId: 'g1', rightCount: 4, wrongCount: 1 }), // mastered
    makeCard({ id: '2', groupId: 'g1', rightCount: 0, wrongCount: 0 }), // unreviewed
    makeCard({ id: '3', groupId: 'g1', rightCount: 1, wrongCount: 4 }), // weak
    makeCard({ id: '4', groupId: 'g2', rightCount: 5, wrongCount: 0 }), // other group
  ];

  const stats = calculateGroupStats(cards, 'g1');
  assert.equal(stats.totalCards, 3);
  assert.equal(stats.totalRight, 5);
  assert.equal(stats.totalWrong, 5);
  assert.equal(stats.totalReviews, 10);
  assert.equal(stats.accuracyPercent, 50);
  assert.equal(stats.unreviewedCount, 1);
  assert.equal(stats.masteredCount, 1);
  assert.equal(getCardAccuracy(cards[1]), null);
  assert.equal(getCardAccuracy(cards[0]), 80);
});
