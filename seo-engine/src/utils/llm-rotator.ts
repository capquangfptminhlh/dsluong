import { GoogleGenAI } from '@google/genai';

export class LLMRotator {
  private keys: string[];
  private currentIndex: number = 0;

  constructor() {
    const keysStr = process.env.GEMINI_API_KEYS || '';
    // Tách bằng dấu phẩy
    this.keys = keysStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    // Fallback nếu người dùng truyền vào biến cũ
    if (this.keys.length === 0 && process.env.GEMINI_API_KEY) {
      this.keys.push(process.env.GEMINI_API_KEY);
    }

    if (this.keys.length === 0) {
      console.warn("⚠️ CẢNH BÁO: Không tìm thấy GEMINI_API_KEYS. Xin hãy thêm vào file .env!");
    } else {
      console.log(`[LLM Rotator] Đã nạp thành công ${this.keys.length} API key để xoay vòng.`);
    }
  }

  // Lấy client với key tiếp theo
  public getClient(): GoogleGenAI {
    if (this.keys.length === 0) {
      throw new Error("Missing Gemini API Keys in environment.");
    }
    
    const key = this.keys[this.currentIndex];
    // Xoay vòng index
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    
    return new GoogleGenAI({ apiKey: key });
  }

  // Tiện ích tự động gọi generateContent
  public async generateText(prompt: string, model: string = "gemini-1.5-pro"): Promise<string> {
    const ai = this.getClient();
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt
      });
      return response.text || "";
    } catch (error: any) {
      // Nếu lỗi quá tải (429), thử lại với key khác 1 lần nữa
      if (error?.status === 429 && this.keys.length > 1) {
        console.warn("⚠️ API Key hiện tại bị giới hạn (429). Tự động xoay sang Key tiếp theo...");
        const fallbackAi = this.getClient();
        const retry = await fallbackAi.models.generateContent({
          model: model,
          contents: prompt
        });
        return retry.text || "";
      }
      throw error;
    }
  }
}

export const rotator = new LLMRotator();
