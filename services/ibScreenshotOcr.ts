import Tesseract from 'tesseract.js';
import { LookupSheetData, TransactionData } from '../types';
import {
  IbScreenshotTradeCandidate,
  OcrLineBox,
  markIbScreenshotDuplicates,
  parseIbOcrPage,
} from './ibScreenshotParser';

export interface IbOcrProgress {
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  status: string;
  progress: number;
}

export interface IbOcrFileReport {
  fileName: string;
  recognizedCount: number;
  message?: string;
}

export interface IbOcrResult {
  candidates: IbScreenshotTradeCandidate[];
  fileReports: IbOcrFileReport[];
}

const getAssetBase = (): string => {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}ocr`;
};

const imageFileToCanvas = async (file: File): Promise<HTMLCanvasElement> => {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('Canvas is unavailable in this browser');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
};

const createActionColorDetector = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return (top: number, bottom: number): 'Buy' | 'Sell' | null => {
    if (!context) return null;
    const x = Math.max(0, Math.round(canvas.width * 0.035));
    const width = Math.max(1, Math.round(canvas.width * 0.25));
    const y = Math.max(0, Math.floor(top));
    const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(bottom - top)));
    if (height <= 0) return null;

    const pixels = context.getImageData(x, y, width, height).data;
    let blue = 0;
    let red = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (saturation < 35 || Math.max(r, g, b) < 65 || Math.min(r, g, b) > 225) continue;
      if (b > r + 25 && b > g + 10) blue += 1;
      if (r > b + 30 && r > g + 12) red += 1;
    }
    if (blue >= 12 && blue > red * 1.35) return 'Buy';
    if (red >= 12 && red > blue * 1.35) return 'Sell';
    return null;
  };
};

const createLeadingMinusDetector = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return (line: OcrLineBox, imageWidth: number): boolean => {
    if (!context) return false;
    const amountWord = [...line.words]
      .filter(word => {
        const center = (word.bbox.x0 + word.bbox.x1) / 2;
        return center >= imageWidth * 0.45 && center <= imageWidth * 0.76;
      })
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)[0];
    if (!amountWord || /^\s*[-−]/.test(amountWord.text)) return false;

    // Tesseract sometimes drops the separate gray minus immediately before a
    // currency value. Look only in the small blank gutter before that word so
    // digits and the dollar sign cannot be mistaken for a minus.
    const x = Math.max(0, Math.floor(amountWord.bbox.x0 - 24));
    const width = Math.max(1, Math.floor(amountWord.bbox.x0 - x));
    const y = Math.max(0, Math.floor(line.bbox.y0));
    const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(line.bbox.y1 - line.bbox.y0)));
    const pixels = context.getImageData(x, y, width, height).data;

    for (let row = 0; row < height; row++) {
      let run = 0;
      for (let column = 0; column < width; column++) {
        const index = (row * width + column) * 4;
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const darkGray = Math.max(r, g, b) < 205 && Math.max(r, g, b) - Math.min(r, g, b) < 28;
        run = darkGray ? run + 1 : 0;
        if (run >= 3) return true;
      }
    }
    return false;
  };
};

const flattenOcrLines = (blocks: Tesseract.Block[] | null): OcrLineBox[] => (blocks || [])
  .flatMap(block => block.paragraphs)
  .flatMap(paragraph => paragraph.lines)
  .map(line => ({
    text: line.text.trim(),
    confidence: line.confidence,
    bbox: line.bbox,
    words: line.words.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox,
    })),
  }));

export const recognizeIbScreenshots = async (
  files: File[],
  lookupData: LookupSheetData | null,
  existingTransactions: TransactionData[],
  onProgress?: (progress: IbOcrProgress) => void,
): Promise<IbOcrResult> => {
  if (files.length === 0) return { candidates: [], fileReports: [] };
  const assetBase = getAssetBase();
  let activeFile = files[0]?.name || '';
  let activeFileIndex = 0;
  const worker = await Tesseract.createWorker(
    ['eng', 'chi_sim'],
    Tesseract.OEM.LSTM_ONLY,
    {
      workerPath: `${assetBase}/worker.min.js`,
      corePath: `${assetBase}/core`,
      langPath: `${assetBase}/lang`,
      workerBlobURL: false,
      gzip: true,
      logger: message => {
        onProgress?.({
          fileName: activeFile,
          fileIndex: activeFileIndex,
          totalFiles: files.length,
          status: message.status,
          progress: Number(message.progress) || 0,
        });
      },
    },
  );

  const allCandidates: IbScreenshotTradeCandidate[] = [];
  const fileReports: IbOcrFileReport[] = [];
  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      activeFile = file.name;
      activeFileIndex = index;
      onProgress?.({
        fileName: file.name,
        fileIndex: index,
        totalFiles: files.length,
        status: 'preparing image',
        progress: 0,
      });

      try {
        const canvas = await imageFileToCanvas(file);
        const recognition = await worker.recognize(
          canvas,
          { rotateAuto: true },
          { text: true, blocks: true },
        );
        const candidates = parseIbOcrPage(
          flattenOcrLines(recognition.data.blocks),
          canvas.width,
          file.name,
          lookupData,
          createActionColorDetector(canvas),
          createLeadingMinusDetector(canvas),
        );
        allCandidates.push(...candidates);
        fileReports.push({
          fileName: file.name,
          recognizedCount: candidates.length,
          message: candidates.length === 0 ? 'No complete IB transaction rows were found' : undefined,
        });
      } catch (error) {
        fileReports.push({
          fileName: file.name,
          recognizedCount: 0,
          message: error instanceof Error ? error.message : 'Unable to read image',
        });
      }
    }
  } finally {
    await worker.terminate();
  }

  return {
    candidates: markIbScreenshotDuplicates(allCandidates, existingTransactions),
    fileReports,
  };
};
