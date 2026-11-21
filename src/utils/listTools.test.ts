import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertNumberedPinyinToMarks,
  copyCardsToGroup,
  deduplicateCards,
  findDuplicates,
  moveCardsToGroup,
  normalizeCardText,
} from './listTools';
import { WordCard } from '../types/flashcard';

function makeCard(overrides: Partial<WordCard> & { id: string }): WordCard {
  return {
    hanzi: '你好',
    pinyin: 'nǐ hǎo',
    translation: 'hello',
    groupId: 'g1',
    rightCount: 0,
    wrongCount: 0,
    lastReviewedAt: null,
    createdAt: 1000,
    ...overrides,
  };
}

test('findDuplicates and deduplicateCards merge stats and remove duplicate hanzi in group', () => {
  const cards = [
    makeCard({ id: '1', hanzi: '你好', rightCount: 2, wrongCount: 1, groupId: 'g1' }),
    makeCard({ id: '2', hanzi: ' 你好 ', rightCount: 1, wrongCount: 2, groupId: 'g1' }),
    makeCard({ id: '3', hanzi: '你好', rightCount: 0, wrongCount: 0, groupId: 'g2' }),
  ];

  const dupesInG1 = findDuplicates(cards, 'g1');
  assert.equal(dupesInG1.length, 1);
  assert.equal(dupesInG1[0].cards.length, 2);

  const deduped = deduplicateCards(cards, 'g1');
  assert.equal(deduped.removedCount, 1);
  assert.equal(deduped.cards.length, 2);
  assert.equal(deduped.cards[0].rightCount, 3);
  assert.equal(deduped.cards[0].wrongCount, 3);
});

test('moveCardsToGroup and copyCardsToGroup update group assignments accurately', () => {
  const cards = [
    makeCard({ id: '1', groupId: 'g1' }),
    makeCard({ id: '2', groupId: 'g1' }),
  ];

  const moved = moveCardsToGroup(cards, new Set(['1']), 'g2');
  assert.equal(moved[0].groupId, 'g2');
  assert.equal(moved[1].groupId, 'g1');

  let seq = 10;
  const copied = copyCardsToGroup(cards, new Set(['2']), 'g3', () => `copy-${seq++}`);
  assert.equal(copied.length, 3);
  assert.equal(copied[2].id, 'copy-10');
  assert.equal(copied[2].groupId, 'g3');
});

test('normalizeCardText trims and collapses whitespace', () => {
  const dirty = makeCard({
    id: '1',
    hanzi: '  谢谢  ',
    pinyin: ' xiè   xie ',
    translation: ' thank   you ',
  });
  const clean = normalizeCardText(dirty);
  assert.equal(clean.hanzi, '谢谢');
  assert.equal(clean.pinyin, 'xiè xie');
  assert.equal(clean.translation, 'thank you');
});

test('convertNumberedPinyinToMarks converts tone numbers to proper diacritics', () => {
  assert.equal(convertNumberedPinyinToMarks('ni3 hao3'), 'nǐ hǎo');
  assert.equal(convertNumberedPinyinToMarks('xie4xie5'), 'xièxie');
  assert.equal(convertNumberedPinyinToMarks('lv4 cha2'), 'lǜ chá');
  assert.equal(convertNumberedPinyinToMarks('huo3che1zhan4'), 'huǒchēzhàn');
});
