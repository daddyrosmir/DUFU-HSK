export interface WordCard {
  id: string;
  hanzi: string;
  pinyin: string;
  translation: string;
  notes?: string;
  groupId: string;
  rightCount: number;
  wrongCount: number;
  lastReviewedAt: number | null;
  createdAt: number;
}

export interface WordGroup {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

export type SwipeDirection = 'right' | 'left';

export interface ReviewLogEntry {
  id: string;
  cardId: string;
  groupId: string;
  hanzi: string;
  result: SwipeDirection;
  timestamp: number;
}

export interface ParsedWordRow {
  hanzi: string;
  pinyin: string;
  translation: string;
  notes?: string;
}

export interface SkippedImportLine {
  lineNumber: number;
  raw: string;
  reason: string;
}

export interface ParsedImportResult {
  rows: ParsedWordRow[];
  skippedLines: SkippedImportLine[];
  detectedDelimiter: string;
}

export interface TableRowInput {
  hanzi: string;
  pinyin: string;
  translation: string;
  notes?: string;
}

export interface GroupStatsSummary {
  totalCards: number;
  totalRight: number;
  totalWrong: number;
  totalReviews: number;
  accuracyPercent: number;
  unreviewedCount: number;
  masteredCount: number;
}

export type AppView = 'study' | 'banks' | 'tools' | 'statistics';
export type ImportMode = 'file' | 'table' | 'text';
