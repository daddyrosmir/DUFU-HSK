import { WordCard } from '../types/flashcard';

export interface DuplicateCluster {
  hanziKey: string;
  cards: WordCard[];
}

export function findDuplicates(cards: WordCard[], scopeGroupId?: string | 'all'): DuplicateCluster[] {
  const scoped =
    !scopeGroupId || scopeGroupId === 'all'
      ? cards
      : cards.filter((c) => c.groupId === scopeGroupId);

  const buckets = new Map<string, WordCard[]>();
  for (const card of scoped) {
    const key = card.hanzi.trim();
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(card);
    buckets.set(key, list);
  }

  const clusters: DuplicateCluster[] = [];
  for (const [hanziKey, list] of buckets.entries()) {
    if (list.length > 1) {
      clusters.push({ hanziKey, cards: list });
    }
  }
  return clusters;
}

/**
 * Removes duplicate hanzi entries within the specified group (or per group when 'all').
 * Preserves combined review counts on the kept card.
 */
export function deduplicateCards(
  cards: WordCard[],
  scopeGroupId: string | 'all'
): { cards: WordCard[]; removedCount: number } {
  const seen = new Map<string, number>();
  const result: WordCard[] = [];
  let removedCount = 0;

  for (const card of cards) {
    const inScope = scopeGroupId === 'all' || card.groupId === scopeGroupId;
    if (!inScope) {
      result.push(card);
      continue;
    }

    const key = `${card.groupId}::${card.hanzi.trim()}`;
    const existingIndex = seen.get(key);
    if (existingIndex === undefined) {
      seen.set(key, result.length);
      result.push({ ...card });
    } else {
      const kept = result[existingIndex];
      result[existingIndex] = {
        ...kept,
        pinyin: kept.pinyin || card.pinyin,
        translation: kept.translation || card.translation,
        notes: kept.notes || card.notes,
        rightCount: kept.rightCount + card.rightCount,
        wrongCount: kept.wrongCount + card.wrongCount,
        lastReviewedAt:
          Math.max(kept.lastReviewedAt ?? 0, card.lastReviewedAt ?? 0) || null,
      };
      removedCount += 1;
    }
  }

  return { cards: result, removedCount };
}

export function normalizeCardText(card: WordCard): WordCard {
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
  return {
    ...card,
    hanzi: clean(card.hanzi),
    pinyin: clean(card.pinyin),
    translation: clean(card.translation),
    notes: card.notes ? clean(card.notes) : undefined,
  };
}

export function moveCardsToGroup(
  cards: WordCard[],
  cardIds: Set<string>,
  targetGroupId: string
): WordCard[] {
  return cards.map((card) =>
    cardIds.has(card.id) ? { ...card, groupId: targetGroupId } : card
  );
}

export function copyCardsToGroup(
  cards: WordCard[],
  cardIds: Set<string>,
  targetGroupId: string,
  createId: () => string,
  now: number = Date.now()
): WordCard[] {
  const copies: WordCard[] = [];
  for (const card of cards) {
    if (cardIds.has(card.id)) {
      copies.push({
        ...card,
        id: createId(),
        groupId: targetGroupId,
        createdAt: now,
      });
    }
  }
  return [...cards, ...copies];
}

const TONE_MAP: Record<string, [string, string, string, string, string]> = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
  A: ['Ā', 'Á', 'Ǎ', 'À', 'A'],
  E: ['Ē', 'É', 'Ě', 'È', 'E'],
  I: ['Ī', 'Í', 'Ǐ', 'Ì', 'I'],
  O: ['Ō', 'Ó', 'Ǒ', 'Ò', 'O'],
  U: ['Ū', 'Ú', 'Ǔ', 'Ù', 'U'],
  Ü: ['Ǖ', 'Ǘ', 'Ǚ', 'Ǜ', 'Ü'],
};

function applyToneToSyllable(syllable: string, tone: number): string {
  const normalized = syllable.replace(/u:/gi, (m) => (m[0] === 'U' ? 'Ü' : 'ü')).replace(/v/g, 'ü').replace(/V/g, 'Ü');
  if (tone < 1 || tone > 4) return normalized;
  const idx = tone - 1;

  // Standard pinyin tone placement priority:
  // 1. a or e
  // 2. o in ou
  // 3. last vowel
  const lower = normalized.toLowerCase();
  let targetPos = -1;

  const aPos = lower.indexOf('a');
  const ePos = lower.indexOf('e');
  const ouPos = lower.indexOf('ou');

  if (aPos !== -1) {
    targetPos = aPos;
  } else if (ePos !== -1) {
    targetPos = ePos;
  } else if (ouPos !== -1) {
    targetPos = ouPos;
  } else {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('aeiouü'.includes(lower[i])) {
        targetPos = i;
        break;
      }
    }
  }

  if (targetPos === -1) return normalized;
  const char = normalized[targetPos];
  const replacements = TONE_MAP[char];
  if (!replacements) return normalized;

  return (
    normalized.slice(0, targetPos) +
    replacements[idx] +
    normalized.slice(targetPos + 1)
  );
}

/**
 * Converts tone-numbered pinyin (e.g. "ni3 hao3", "lu:4 cha2") into diacritic tone marks ("nǐ hǎo", "lǜ chá").
 */
export function convertNumberedPinyinToMarks(input: string): string {
  return input.replace(/([a-zA-ZüÜ:]+)([1-5])/g, (_match, syl: string, toneStr: string) => {
    const tone = Number(toneStr);
    return applyToneToSyllable(syl, tone);
  });
}
