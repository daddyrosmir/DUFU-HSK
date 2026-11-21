import {
  ParsedImportResult,
  ParsedWordRow,
  SkippedImportLine,
  TableRowInput,
  WordCard,
  WordGroup,
} from '../types/flashcard';

export type DelimiterOption =
  | 'auto'
  | 'tab'
  | 'comma'
  | 'pipe'
  | 'semicolon'
  | 'dash';

const HEADER_TOKENS = new Set([
  'hanzi',
  'character',
  'characters',
  'chinese',
  'word',
  'front',
  'hieroglyph',
  'term',
]);

const PINYIN_HEADER_TOKENS = new Set([
  'pinyin',
  'pronunciation',
  'reading',
  'romanization',
]);

const TRANSLATION_HEADER_TOKENS = new Set([
  'translation',
  'meaning',
  'english',
  'definition',
  'back',
  'gloss',
]);

function isHeaderRow(cols: string[]): boolean {
  if (cols.length < 2) return false;
  const c0 = cols[0].trim().toLowerCase();
  const c1 = cols[1].trim().toLowerCase();
  const c2 = (cols[2] ?? '').trim().toLowerCase();
  if (
    HEADER_TOKENS.has(c0) &&
    (PINYIN_HEADER_TOKENS.has(c1) || TRANSLATION_HEADER_TOKENS.has(c1) || TRANSLATION_HEADER_TOKENS.has(c2))
  ) {
    return true;
  }
  return false;
}

/**
 * Parses a single RFC-4180 CSV line supporting quoted fields and escaped quotes ("").
 */
export function parseCsvLine(line: string, delimiterChar: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiterChar) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function detectDelimiter(lines: string[]): Exclude<DelimiterOption, 'auto'> {
  const sample = lines.slice(0, 10);
  const scores: Record<Exclude<DelimiterOption, 'auto'>, number> = {
    tab: 0,
    pipe: 0,
    semicolon: 0,
    comma: 0,
    dash: 0,
  };

  for (const line of sample) {
    if (line.includes('\t')) scores.tab += 3;
    if (line.includes('|')) scores.pipe += 3;
    if (line.includes(';')) scores.semicolon += 2;
    if (line.includes(',')) scores.comma += 1.5;
    if (/\s+[-–—]\s+/.test(line)) scores.dash += 1;
  }

  let best: Exclude<DelimiterOption, 'auto'> = 'tab';
  let bestScore = 0;
  for (const [key, score] of Object.entries(scores) as [
    Exclude<DelimiterOption, 'auto'>,
    number,
  ][]) {
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return bestScore > 0 ? best : 'comma';
}

function splitByDelimiter(line: string, delimiter: Exclude<DelimiterOption, 'auto'>): string[] {
  switch (delimiter) {
    case 'tab':
      return line.split('\t').map((s) => s.trim());
    case 'pipe':
      return line.split('|').map((s) => s.trim());
    case 'semicolon':
      return parseCsvLine(line, ';');
    case 'comma':
      return parseCsvLine(line, ',');
    case 'dash':
      return line.split(/\s+[-–—]\s+/).map((s) => s.trim());
  }
}

/**
 * Supports parenthetical inline format like:
 *   你好 (nǐ hǎo) - hello
 *   谢谢 [xièxie] thank you
 */
function tryParseInlineParenthetical(line: string): ParsedWordRow | null {
  const match = line.match(
    /^([^\s(\[]+(?:\s+[^\s(\[]+)*)\s*[(\[]([^)\]]+)[)\]]\s*(?:[-–—:]\s*)?(.+)$/
  );
  if (!match) return null;
  const hanzi = match[1].trim();
  const pinyin = match[2].trim();
  const translation = match[3].trim();
  if (!hanzi || !translation) return null;
  return { hanzi, pinyin, translation };
}

export function parseDelimitedText(
  input: string,
  options?: { delimiter?: DelimiterOption; hasHeader?: boolean }
): ParsedImportResult {
  const rawLines = input.split(/\r?\n/);
  const nonEmptyLines = rawLines
    .map((raw, idx) => ({ raw: raw.trim(), lineNumber: idx + 1 }))
    .filter((entry) => entry.raw.length > 0 && !entry.raw.startsWith('#'));

  if (nonEmptyLines.length === 0) {
    return { rows: [], skippedLines: [], detectedDelimiter: 'none' };
  }

  const chosen = options?.delimiter ?? 'auto';
  const activeDelimiter: Exclude<DelimiterOption, 'auto'> =
    chosen === 'auto'
      ? detectDelimiter(nonEmptyLines.map((l) => l.raw))
      : chosen;

  const rows: ParsedWordRow[] = [];
  const skippedLines: SkippedImportLine[] = [];

  for (let i = 0; i < nonEmptyLines.length; i++) {
    const { raw, lineNumber } = nonEmptyLines[i];

    // Check inline parenthetical format first when auto-detecting (e.g. "谢谢 (xièxie) - thank you")
    if (chosen === 'auto') {
      const inline = tryParseInlineParenthetical(raw);
      if (inline) {
        rows.push(inline);
        continue;
      }
    }

    const cols = splitByDelimiter(raw, activeDelimiter);

    if (i === 0 && (options?.hasHeader || isHeaderRow(cols))) {
      continue;
    }

    if (cols.length < 2) {
      skippedLines.push({
        lineNumber,
        raw,
        reason: 'Expected at least 2 columns (Hanzi, Pinyin, Translation)',
      });
      continue;
    }

    const hanzi = cols[0].trim();
    let pinyin = '';
    let translation = '';
    let notes: string | undefined;

    if (cols.length === 2) {
      // 2-column fallback: Hanzi + Translation (empty pinyin)
      translation = cols[1].trim();
    } else {
      pinyin = cols[1].trim();
      translation = cols[2].trim();
      if (cols[3] && cols[3].trim().length > 0) {
        notes = cols[3].trim();
      }
    }

    if (!hanzi) {
      skippedLines.push({
        lineNumber,
        raw,
        reason: 'Missing Hanzi character/word',
      });
      continue;
    }
    if (!translation && !pinyin) {
      skippedLines.push({
        lineNumber,
        raw,
        reason: 'Missing both Pinyin and Translation',
      });
      continue;
    }

    rows.push({ hanzi, pinyin, translation, notes });
  }

  return {
    rows,
    skippedLines,
    detectedDelimiter: activeDelimiter,
  };
}

export function parseJsonImport(jsonText: string): ParsedImportResult {
  const trimmed = jsonText.trim();
  if (!trimmed) {
    return { rows: [], skippedLines: [], detectedDelimiter: 'json' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      rows: [],
      skippedLines: [{ lineNumber: 1, raw: trimmed.slice(0, 60), reason: 'Invalid JSON syntax' }],
      detectedDelimiter: 'json',
    };
  }

  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { cards?: unknown[] }).cards)
    ? (parsed as { cards: unknown[] }).cards
    : [];

  if (items.length === 0) {
    return {
      rows: [],
      skippedLines: [{ lineNumber: 1, raw: 'JSON', reason: 'Expected an array of word objects or { cards: [...] }' }],
      detectedDelimiter: 'json',
    };
  }

  const rows: ParsedWordRow[] = [];
  const skippedLines: SkippedImportLine[] = [];

  items.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      skippedLines.push({ lineNumber: index + 1, raw: String(item), reason: 'Item is not an object' });
      return;
    }
    const obj = item as Record<string, unknown>;
    const hanzi = String(
      obj.hanzi ?? obj.word ?? obj.character ?? obj.chinese ?? obj.front ?? ''
    ).trim();
    const pinyin = String(obj.pinyin ?? obj.pronunciation ?? obj.reading ?? '').trim();
    const translation = String(
      obj.translation ?? obj.meaning ?? obj.english ?? obj.back ?? obj.definition ?? ''
    ).trim();
    const notesRaw = obj.notes ?? obj.note ?? obj.example;
    const notes = notesRaw ? String(notesRaw).trim() : undefined;

    if (!hanzi || (!translation && !pinyin)) {
      skippedLines.push({
        lineNumber: index + 1,
        raw: JSON.stringify(obj).slice(0, 60),
        reason: 'Object must include hanzi and translation/pinyin',
      });
      return;
    }

    rows.push({ hanzi, pinyin, translation, notes });
  });

  return { rows, skippedLines, detectedDelimiter: 'json' };
}

export function parseTableRows(tableRows: TableRowInput[]): ParsedImportResult {
  const rows: ParsedWordRow[] = [];
  const skippedLines: SkippedImportLine[] = [];

  tableRows.forEach((row, index) => {
    const hanzi = row.hanzi.trim();
    const pinyin = row.pinyin.trim();
    const translation = row.translation.trim();
    const notes = row.notes?.trim() || undefined;

    if (!hanzi && !pinyin && !translation) {
      return; // ignore blank template rows silently
    }

    if (!hanzi || (!pinyin && !translation)) {
      skippedLines.push({
        lineNumber: index + 1,
        raw: `${hanzi || '(empty)'} | ${pinyin} | ${translation}`,
        reason: 'Row requires Hanzi and at least Translation or Pinyin',
      });
      return;
    }

    rows.push({ hanzi, pinyin, translation, notes });
  });

  return { rows, skippedLines, detectedDelimiter: 'table' };
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeToCsv(cards: WordCard[]): string {
  const header = ['hanzi', 'pinyin', 'translation', 'notes', 'rightCount', 'wrongCount'].join(',');
  const lines = cards.map((card) =>
    [
      escapeCsvField(card.hanzi),
      escapeCsvField(card.pinyin),
      escapeCsvField(card.translation),
      escapeCsvField(card.notes ?? ''),
      String(card.rightCount),
      String(card.wrongCount),
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

export function serializeToTsv(cards: WordCard[]): string {
  const header = ['hanzi', 'pinyin', 'translation', 'notes'].join('\t');
  const lines = cards.map((card) =>
    [card.hanzi, card.pinyin, card.translation, card.notes ?? '']
      .map((f) => f.replace(/\t/g, ' '))
      .join('\t')
  );
  return [header, ...lines].join('\n');
}

export function serializeToJson(cards: WordCard[], groups: WordGroup[]): string {
  return JSON.stringify({ groups, cards }, null, 2);
}
