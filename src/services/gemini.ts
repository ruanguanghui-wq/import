import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function mapExcelHeaders(rows: any[][]): Promise<{ colMap: Record<string, number>, headerIndex: number }> {
  try {
    // Take first 15 rows to find header
    const sampleRows = rows.slice(0, 15);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert at mapping Excel column headers to database fields.
      Given these first few rows of an Excel file (Vietnamese context): ${JSON.stringify(sampleRows)}
      
      Identify which row index (0-based) is the header row and map the columns to these fields:
      - productCode: The unique identifier, part number, SKU, or "Mã sản phẩm". Avoid sequence numbers like "No" or "STT".
      - productName: The name, description, or "Tên sản phẩm", "Vietnamese Name".
      - quantity: The number of items, "Số lượng", "Đặt hàng", "Qty".
      - price: The unit price, "Đơn giá", "Giá dự kiến", "Price".
      
      Return a JSON object with:
      - headerIndex: The 0-based index of the row that contains the headers.
      - colMap: An object where keys are the field names and values are the 0-based column indices.
      
      If a field is not found, use -1 for the index.
      
      Example output: {"headerIndex": 0, "colMap": {"productCode": 1, "productName": 2, "quantity": 4, "price": 5}}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headerIndex: { type: Type.INTEGER },
            colMap: {
              type: Type.OBJECT,
              properties: {
                productCode: { type: Type.INTEGER },
                productName: { type: Type.INTEGER },
                quantity: { type: Type.INTEGER },
                price: { type: Type.INTEGER }
              },
              required: ["productCode", "productName", "quantity", "price"]
            }
          },
          required: ["headerIndex", "colMap"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result;
  } catch (error) {
    console.error("AI Mapping failed:", error);
    return { headerIndex: -1, colMap: { productCode: -1, productName: -1, quantity: -1, price: -1 } };
  }
}
