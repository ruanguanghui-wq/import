import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function mapExcelHeaders(
  rows: any[][],
  targetFields: string[] = [
    "productCode",
    "productName",
    "quantity",
    "price",
    "date",
  ],
): Promise<{ colMap: Record<string, number>; headerIndex: number }> {
  try {
    // Take first 15 rows to find header
    const sampleRows = rows.slice(0, 15);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Bạn là một chuyên gia trong việc ánh xạ các tiêu đề cột Excel với các trường cơ sở dữ liệu.
      Dựa vào một vài dòng đầu tiên của file Excel sau (ngữ cảnh tiếng Việt): ${JSON.stringify(sampleRows)}
      
      Hãy xác định chỉ số dòng (bắt đầu từ 0) nào là dòng tiêu đề và ánh xạ các cột với các trường sau:
      ${targetFields.map((f) => `- ${f}`).join("\n")}
      
      Trả về một đối tượng JSON với:
      - headerIndex: Chỉ số dòng (bắt đầu từ 0) chứa các tiêu đề.
      - colMap: Một đối tượng trong đó các khóa là tên trường và giá trị là chỉ số cột (bắt đầu từ 0).
      
      Nếu một trường không được tìm thấy, hãy sử dụng -1 cho chỉ số.
      
      Ví dụ đầu ra: {"headerIndex": 0, "colMap": ${JSON.stringify(Object.fromEntries(targetFields.map((f, i) => [f, i])))}}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headerIndex: { type: Type.INTEGER },
            colMap: {
              type: Type.OBJECT,
              properties: Object.fromEntries(
                targetFields.map((f) => [f, { type: Type.INTEGER }]),
              ),
              required: targetFields,
            },
          },
          required: ["headerIndex", "colMap"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    return result;
  } catch (error) {
    console.error("AI Mapping failed:", error);
    return {
      headerIndex: -1,
      colMap: Object.fromEntries(targetFields.map((f) => [f, -1])),
    };
  }
}
