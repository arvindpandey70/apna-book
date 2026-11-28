import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { parse26AsLines, type Parsed26AsResult } from "./parse26AsLines";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Groups PDF.js text items into horizontal visual lines sorted top-to-bottom,
 * and joins tokens left-to-right within each line.
 */
function groupTextItemsIntoLines(items: any[]): string[] {
  const positioned: PositionedTextItem[] = [];

  for (const item of items) {
    if (!item || typeof item.str !== "string") continue;
    const text = item.str.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
    positioned.push({
      str: text,
      x: Number(transform[4] || 0),
      y: Number(transform[5] || 0),
    });
  }

  // Sort top-to-bottom (higher y is higher on page in PDF coordinates)
  positioned.sort((a, b) => {
    if (Math.abs(b.y - a.y) > 2.5) return b.y - a.y;
    return a.x - b.x;
  });

  const rows: { y: number; items: PositionedTextItem[] }[] = [];
  const Y_TOLERANCE = 2.8;

  for (const item of positioned) {
    let targetRow = rows.find((r) => Math.abs(r.y - item.y) <= Y_TOLERANCE);
    if (!targetRow) {
      targetRow = { y: item.y, items: [] };
      rows.push(targetRow);
    }
    targetRow.items.push(item);
  }

  return rows.map((row) => {
    row.items.sort((a, b) => a.x - b.x);
    return row.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
  });
}

export class PdfPasswordRequiredError extends Error {
  public readonly code: number;
  constructor(message: string, code = 1) {
    super(message);
    this.name = "PdfPasswordRequiredError";
    this.code = code;
  }
}

export async function parseForm26AsPdf(
  file: File,
  password?: string
): Promise<Parsed26AsResult> {
  const data = new Uint8Array(await file.arrayBuffer());

  let pdf: pdfjsLib.PDFDocumentProxy;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data,
      password: password || undefined,
    });
    pdf = await loadingTask.promise;
  } catch (err: any) {
    if (err?.name === "PasswordException") {
      // code 1 = NEED_PASSWORD, code 2 = INCORRECT_PASSWORD
      throw new PdfPasswordRequiredError(
        err.code === 2
          ? "Incorrect PDF password. TRACES ATS 168 password is usually Date of Birth (DDMMYYYY)."
          : "This ATS 168 PDF is password protected. Please enter the password.",
        err.code || 1
      );
    }
    throw err;
  }

  const allLines: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageLines = groupTextItemsIntoLines(textContent.items as any[]);
    allLines.push(...pageLines);
  }

  if (allLines.length === 0) {
    throw new Error(
      "No selectable text found in this PDF. Please upload the original digital ATS 168 PDF downloaded from TRACES / Income Tax portal."
    );
  }

  return parse26AsLines(allLines, pdf.numPages);
}
