import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { groupPdfTextItemsIntoLines, PdfTextItem } from './hskParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractedPdfResult {
  text: string;
  pageCount: number;
}

export async function extractTextFromPdfBuffer(
  buffer: ArrayBuffer
): Promise<ExtractedPdfResult> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];

      for (const item of content.items) {
        if ('str' in item && typeof item.str === 'string' && Array.isArray(item.transform)) {
          items.push({
            str: item.str,
            x: Number(item.transform[4] ?? 0),
            y: Number(item.transform[5] ?? 0),
          });
        }
      }

      const lines = groupPdfTextItemsIntoLines(items);
      pageTexts.push(lines.join('\n'));
      page.cleanup();
    }

    return {
      text: pageTexts.join('\n'),
      pageCount: pdf.numPages,
    };
  } finally {
    await loadingTask.destroy();
  }
}
