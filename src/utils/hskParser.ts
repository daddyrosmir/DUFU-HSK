import { HSK_GLOSSARY } from '../data/hskGlossary';
import { ParsedWordRow, SkippedImportLine } from '../types/flashcard';

export interface HskParsedWordRow extends ParsedWordRow {
  index: number;
  hskLevel: number;
  rawLevel: string;
  pos?: string;
}

export interface HskParseResult {
  rows: HskParsedWordRow[];
  skippedLines: SkippedImportLine[];
  levelCounts: Record<number, number>;
}

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

const POS_LABEL_MAP: Record<string, string> = {
  '名': 'Noun',
  '动': 'Verb',
  '形': 'Adjective',
  '副': 'Adverb',
  '代': 'Pronoun',
  '数': 'Number',
  '量': 'Measure word',
  '数量': 'Numeral-measure',
  '介': 'Preposition',
  '连': 'Conjunction',
  '助': 'Particle',
  '叹': 'Interjection',
  '拟声': 'Onomatopoeia',
  '前缀': 'Prefix',
  '后缀': 'Suffix',
};

export function formatChinesePos(rawPos: string): string {
  const trimmed = rawPos.trim();
  if (!trimmed) return '';
  const parts = trimmed
    .split(/[、,，]/)
    .map((token) => {
      const cleanToken = token.replace(/[（）()]/g, '').trim();
      const eng = POS_LABEL_MAP[cleanToken];
      if (!eng) return token.trim();
      return token.includes('（') || token.includes('(') ? `(${eng})` : eng;
    })
    .filter(Boolean);
  return parts.length > 0 ? `${parts.join(', ')} (${trimmed})` : trimmed;
}

export function cleanHskHanzi(rawWord: string): {
  hanzi: string;
  senseTag?: string;
} {
  const trimmed = rawWord.trim();
  const match = trimmed.match(/^(.+?)(\d+)$/);
  if (match) {
    return { hanzi: match[1].trim(), senseTag: `Sense ${match[2]}` };
  }
  return { hanzi: trimmed };
}

export function lookupHskTranslation(
  rawWord: string,
  cleanHanzi: string,
  pinyin: string
): string {
  const exactHomograph = HSK_GLOSSARY[`${cleanHanzi}::${pinyin}`];
  if (exactHomograph) return exactHomograph;
  const byRaw = HSK_GLOSSARY[rawWord.trim()];
  if (byRaw) return byRaw;
  const byClean = HSK_GLOSSARY[cleanHanzi];
  if (byClean) return byClean;
  return '';
}

/**
 * Groups PDF text items on a page into tab-separated table rows using Y-coordinate clustering.
 */
export function groupPdfTextItemsIntoLines(items: PdfTextItem[]): string[] {
  const nonEmpty = items.filter((item) => item.str.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  // Sort top-to-bottom (y descending), then left-to-right (x ascending)
  const sorted = [...nonEmpty].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
    return a.x - b.x;
  });

  const rows: PdfTextItem[][] = [];
  for (const item of sorted) {
    const lastRow = rows[rows.length - 1];
    if (!lastRow || Math.abs(lastRow[0].y - item.y) > 3) {
      rows.push([item]);
    } else {
      lastRow.push(item);
    }
  }

  return rows.map((row) => {
    const ordered = [...row].sort((a, b) => a.x - b.x);
    let line = '';
    for (let i = 0; i < ordered.length; i++) {
      const part = ordered[i].str.trim();
      if (!part) continue;
      if (i === 0) {
        line = part;
      } else {
        const prev = ordered[i - 1];
        const gap = ordered[i].x - prev.x;
        // Separate distinct PDF columns with a tab so multi-word pinyin stays together
        line += gap > 25 ? `\t${part}` : ` ${part}`;
      }
    }
    return line;
  });
}

/**
 * Detects whether a text block follows the Official HSK vocabulary table format.
 */
export function isOfficialHskText(text: string): boolean {
  const sample = text.slice(0, 1200);
  if (
    sample.includes('序号') &&
    sample.includes('等级') &&
    sample.includes('词语') &&
    sample.includes('拼音')
  ) {
    return true;
  }
  if (sample.includes('汉考国际')) return true;

  const lines = sample
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let hskLineMatches = 0;
  for (const line of lines.slice(0, 12)) {
    // e.g. "1\t1\t爱\tài\t动" or "7 1（4） 半 bàn 数、（副）"
    if (/^\d+\s+[1-9](?:[（(][^）)]+[）)])?\s+[\u4e00-\u9fff]/.test(line)) {
      hskLineMatches += 1;
    }
  }
  return hskLineMatches >= 2;
}

const POS_TOKEN_PATTERN =
  /^(?:[名动形副代数量介连助叹]|数量|拟声|前缀|后缀|[（(][名动形副代数量介连助叹、，,]+[）)])(?:[、,，](?:[名动形副代数量介连助叹]|数量|拟声|前缀|后缀|[（(][名动形副代数量介连助叹、，,]+[）)]))*$/;

/**
 * Parses Official HSK table text (both line-by-line tab/space rows and flattened OCR text).
 */
export function parseOfficialHskText(
  rawText: string,
  options?: { allowedLevels?: number[]; enrichTranslations?: boolean }
): HskParseResult {
  const enrich = options?.enrichTranslations ?? true;
  const allowed = options?.allowedLevels ? new Set(options.allowedLevels) : null;

  // Strip footer watermarks and normalize full-width spaces
  const cleanedText = rawText
    .replace(/\b\d+\s+汉考国际(?:\s+汉考国际)*/g, '\n')
    .replace(/汉考国际/g, '');

  const rawLines = cleanedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // If pasted as a single long flattened OCR line, split before each entry index pattern:
  // "<index> <level> <hanzi>"
  const normalizedLines: string[] = [];
  for (const line of rawLines) {
    // Skip header or standalone page numbers
    if (/^序号\s+等级\s+词语\s+拼音/.test(line)) {
      // Check if entries follow on the same line after "词性"
      const afterHeader = line.replace(/^序号\s+等级\s+词语\s+拼音(?:\s+词性)?\s*/, '');
      if (!afterHeader) continue;
      const chunks = afterHeader.split(/(?=\b\d+\s+[1-9](?:\s*[（(][^)）]+[）)])?\s+[\u4e00-\u9fff])/);
      normalizedLines.push(...chunks.map((c) => c.trim()).filter(Boolean));
      continue;
    }

    if (/^\d{1,3}$/.test(line)) continue; // page number

    // Check if multiple HSK rows are packed on one line
    const rowStarts = line.match(/\b\d+\s+[1-9](?:\s*[（(][^)）]+[）)])?\s+[\u4e00-\u9fff]/g);
    if (rowStarts && rowStarts.length > 1) {
      const chunks = line.split(/(?=\b\d+\s+[1-9](?:\s*[（(][^)）]+[）)])?\s+[\u4e00-\u9fff])/);
      normalizedLines.push(...chunks.map((c) => c.trim()).filter(Boolean));
    } else {
      normalizedLines.push(line);
    }
  }

  const rows: HskParsedWordRow[] = [];
  const skippedLines: SkippedImportLine[] = [];
  const levelCounts: Record<number, number> = {};

  normalizedLines.forEach((line, lineIdx) => {
    if (/^序号/.test(line) || /^\d{1,3}$/.test(line)) return;

    // Prefer tab-delimited columns when available (e.g. from PDF coordinate grouping)
    if (line.includes('\t')) {
      const cols = line.split('\t').map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 4 && /^\d+$/.test(cols[0])) {
        const index = Number(cols[0]);
        const rawLevel = cols[1];
        const levelMatch = rawLevel.match(/^([1-9])/);
        if (!levelMatch) {
          skippedLines.push({ lineNumber: lineIdx + 1, raw: line, reason: 'Invalid HSK level' });
          return;
        }
        const hskLevel = Number(levelMatch[1]);
        levelCounts[hskLevel] = (levelCounts[hskLevel] ?? 0) + 1;
        if (allowed && !allowed.has(hskLevel)) return;

        const rawWord = cols[2];
        const pinyin = cols[3];
        const rawPos = cols[4] ?? '';
        const { hanzi, senseTag } = cleanHskHanzi(rawWord);
        const posText = formatChinesePos(rawPos);
        const translation = enrich
          ? lookupHskTranslation(rawWord, hanzi, pinyin)
          : '';

        const noteParts = [`HSK ${rawLevel}`];
        if (posText) noteParts.push(posText);
        if (senseTag) noteParts.push(senseTag);

        rows.push({
          index,
          hskLevel,
          rawLevel,
          hanzi,
          pinyin,
          translation: translation || (posText ? `[${posText}]` : `HSK ${hskLevel} word`),
          pos: rawPos || undefined,
          notes: noteParts.join(' · '),
        });
        return;
      }
    }

    // Space-separated fallback (OCR / copied PDF table text)
    const match = line.match(
      /^(\d+)\s+([1-9](?:\s*[（(][^）)]+[）)])*)\s+([^\s]+)\s+(.+)$/
    );
    if (!match) {
      skippedLines.push({
        lineNumber: lineIdx + 1,
        raw: line,
        reason: 'Could not match HSK row columns (Index Level Word Pinyin [POS])',
      });
      return;
    }

    const index = Number(match[1]);
    const rawLevel = match[2].replace(/\s+/g, '');
    const hskLevel = Number(rawLevel[0]);
    levelCounts[hskLevel] = (levelCounts[hskLevel] ?? 0) + 1;
    if (allowed && !allowed.has(hskLevel)) return;

    const rawWord = match[3];
    const remainderTokens = match[4].trim().split(/\s+/);

    let rawPos = '';
    if (
      remainderTokens.length >= 2 &&
      POS_TOKEN_PATTERN.test(remainderTokens[remainderTokens.length - 1])
    ) {
      rawPos = remainderTokens.pop() ?? '';
    }
    const pinyin = remainderTokens.join(' ');
    const { hanzi, senseTag } = cleanHskHanzi(rawWord);
    const posText = formatChinesePos(rawPos);
    const translation = enrich
      ? lookupHskTranslation(rawWord, hanzi, pinyin)
      : '';

    const noteParts = [`HSK ${rawLevel}`];
    if (posText) noteParts.push(posText);
    if (senseTag) noteParts.push(senseTag);

    rows.push({
      index,
      hskLevel,
      rawLevel,
      hanzi,
      pinyin,
      translation: translation || (posText ? `[${posText}]` : `HSK ${hskLevel} word`),
      pos: rawPos || undefined,
      notes: noteParts.join(' · '),
    });
  });

  return { rows, skippedLines, levelCounts };
}
