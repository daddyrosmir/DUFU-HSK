import { SEED_CARDS, SEED_GROUPS } from '../data/seedData';
import { ReviewLogEntry, WordCard, WordGroup } from '../types/flashcard';

const STORAGE_KEY = 'hanzicard_state_v1';

export interface PersistedAppState {
  groups: WordGroup[];
  cards: WordCard[];
  reviewLog: ReviewLogEntry[];
  activeGroupId: string | 'all';
}

export function createId(prefix: string = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadAppState(): PersistedAppState {
  if (typeof window === 'undefined') {
    return {
      groups: SEED_GROUPS,
      cards: SEED_CARDS,
      reviewLog: [],
      activeGroupId: SEED_GROUPS[0]?.id ?? 'all',
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        groups: SEED_GROUPS,
        cards: SEED_CARDS,
        reviewLog: [],
        activeGroupId: SEED_GROUPS[0]?.id ?? 'all',
      };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    const groups = Array.isArray(parsed.groups) && parsed.groups.length > 0 ? parsed.groups : SEED_GROUPS;
    const cards = Array.isArray(parsed.cards) ? parsed.cards : SEED_CARDS;
    const reviewLog = Array.isArray(parsed.reviewLog) ? parsed.reviewLog : [];
    const activeGroupId =
      typeof parsed.activeGroupId === 'string' &&
      (parsed.activeGroupId === 'all' || groups.some((g) => g.id === parsed.activeGroupId))
        ? parsed.activeGroupId
        : groups[0]?.id ?? 'all';

    return { groups, cards, reviewLog, activeGroupId };
  } catch {
    return {
      groups: SEED_GROUPS,
      cards: SEED_CARDS,
      reviewLog: [],
      activeGroupId: SEED_GROUPS[0]?.id ?? 'all',
    };
  }
}

export function saveAppState(state: PersistedAppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota failures silently
  }
}
