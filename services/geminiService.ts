import { GoogleGenAI, SchemaType } from "@google/genai";
import { TransactionData } from "../types";
import { generateId } from "./excelService";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const parseTransactionImage = async (file: File): Promise<Partial<TransactionData>[]> => {
  const fileData = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(fileData);

  const prompt = `
    Analyze this image of a stock transaction history. Extract the following fields for each transaction:
    - Stock (ticker symbol, e.g., FIS, FDS)
    - Action (Buy or Sell). Note: '买入' means Buy, '卖出' means Sell.
    - Price (per share)
    - Shares (quantity)
    - Date (YYYY-MM-DD format). If the date is in a header (e.g., "February 27, 2026"), apply it to the transactions below it.
    - Commission (the small dollar amount usually under the price or total)
    - Total Amount (Price * Shares, or the total value shown)

    Return a JSON array of objects with the following schema:
    [
      {
        "stock": "string",
        "action": "Buy" | "Sell",
        "price": number,
        "shares": number,
        "date": "string",
        "commission": number,
        "total": number
      }
    ]
    
    Ensure all numbers are parsed correctly. If commission is not explicitly labeled but appears as a small value (e.g., $1.00), treat it as commission.
    If the image contains multiple dates, use the correct date for each transaction.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: file.type,
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) return [];

    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        // If the response is wrapped in markdown code block, extract it
        const match = text.match(/```json([\s\S]*?)```/);
        if (match) {
            data = JSON.parse(match[1]);
        } else {
            throw new Error("Failed to parse JSON response");
        }
    }
    
    if (!Array.isArray(data)) {
        throw new Error("Response is not an array");
    }

    return data.map((item: any) => ({
      id: generateId(),
      stock: item.stock.toUpperCase(),
      action: item.action,
      price: item.price,
      shares: item.shares,
      date: item.date,
      commission: item.commission || 0,
      total: item.total || (item.price * item.shares), // Fallback calculation
      source: 'Image Upload',
      lastPrice: item.price, // Initial last price is the transaction price
      lastMv: (item.price * item.shares),
      name: '', // Will be filled by lookup if available
      market: '', // Will be filled by lookup if available
    }));
  } catch (error) {
    console.error("Error parsing transaction image:", error);
    throw new Error("Failed to parse transaction image. Please try again.");
  }
};
