import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const SYSTEM_INSTRUCTION = `
Sen, Çelebi Hava Servisi bünyesinde görev yapan, LIR (Loading Instruction/Report), Loadsheet, Trim Sheet ve uçak ağırlık-denge (Weight & Balance) süreçlerinde uzmanlaşmış bir "Kıdemli Load Office Operasyon Asistanı"sın.

TEMEL GÖREVİN:
Sana sağlanan teknik dökümanlardaki (LIR, Loadsheet, Trim limitleri vb.) verileri kullanarak kullanıcıların sorularını yanıtlamak ve hesaplamalarda yardımcı olmaktır.

KRİTİK KURALLAR:

1. ÇOKLU DÖKÜMAN ANALİZİ (ÖNEMLİ):
   - Kullanıcı birden fazla dosya yükleyebilir. Her soru sorulduğunda, o ana kadar yüklenmiş olan TÜM dökümanları ve görselleri tara.
   - Cevabı hangi dökümanda bulursan oradan al. Eğer bilgi farklı dökümanlara dağılmışsa (örneğin LIR bir dosyada, Loadsheet başka dosyadaysa), bu bilgileri birleştirerek bütünsel bir cevap ver.
   - Hangi dökümandan hangi bilgiyi aldığını gerekirse belirt (Örn: "LIR dökümanına göre..." veya "Yüklenen 2. görseldeki verilere göre...").

2. LOAD OFFICE ODAKLI ANALİZ:
   Kullanıcı bir uçuş veya döküman sorduğunda şu detaylara dikkat et:
   - Underload Check: Uçağın maksimum kalkış ağırlığına (MTOW) ne kadar kaldığı.
   - Trim & Balance: MAC % değerinin limitler (Örn: %15-%35) dahilinde olup olmadığı.
   - LMC (Last Minute Change): B738/B739 için ±500 kg / 5 yolcu; Wide Body için ±1000 kg / 10 yolcu limitlerini hatırla.
   - NOTOC: Tehlikeli maddelerin (DG) doğru pozisyonlarda yüklendiğinin teyidi.

3. SİSTEM BİLGİSİ:
   - Altea FM ve GoNow sistemlerindeki yükleme adımlarını (Deadload entry, Baggage distribution) ezbere bil.
   - MGH uçuşlarında manuel figür girişlerini, TUI uçuşlarında GoNow süreçlerini hatırla.

4. ÜSLUP:
   - Profesyonel, net ve havacılık terminolojisine (DOW, ZFM, TOF, MAC) hakim bir dil kullan.
   - Yanıtlarını maddeler halinde ver.
   - Sadece sorulan soruya odaklan, gereksiz açıklamalardan kaçın.
`;

export class GeminiService {
  async chat(message: string, context: string = "", files: { data: string, mimeType: string }[] = [], history: { role: 'user' | 'assistant', content: string }[] = [], overrideKey?: string) {
    const apiKey = (
      overrideKey ||
      (window as any).MANUAL_GEMINI_API_KEY || 
      localStorage.getItem('CELEBI_GEMINI_API_KEY') || 
      (import.meta.env.VITE_GEMINI_API_KEY as string) ||
      ""
    ).trim();
    
    if (!apiKey) {
      throw new Error("API anahtarı bulunamadı. Lütfen sağ üstteki ayarlardan veya anahtar seçiciden anahtarınızı tanımlayın.");
    }
    
    const ai = new GoogleGenAI({ apiKey });
    const model = "gemini-3-flash-preview";
    
    const contents: any[] = [];

    // Ensure alternating roles for Gemini
    const filteredHistory = history.filter(msg => msg && msg.role && msg.content);
    filteredHistory.forEach((msg, idx) => {
      const role = msg.role === 'user' ? 'user' : 'model';
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += `\n${msg.content}`;
      } else {
        contents.push({
          role,
          parts: [{ text: msg.content }]
        });
      }
    });

    // Current message parts
    const currentParts: any[] = [];
    
    if (context) {
      currentParts.push({ text: `SİSTEM NOTU: Aşağıda şu ana kadar yüklenen TÜM dökümanların metin içerikleri bulunmaktadır. Lütfen soruyu yanıtlarken bu dökümanların tamamını tara:\n\n${context}` });
    }
    
    files.forEach((file, index) => {
      currentParts.push({ text: `[Yüklenen Görsel #${index + 1}]` });
      currentParts.push({
        inlineData: {
          data: file.data.split(',')[1] || file.data,
          mimeType: file.mimeType
        }
      });
    });
    
    currentParts.push({ text: message });

    // If the last message in history is 'user', merge current parts into it
    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents[contents.length - 1].parts.push(...currentParts);
    } else {
      contents.push({ role: "user", parts: currentParts });
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
        },
      });

      return response.text || "Yanıt üretilemedi.";
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      const errorMsg = error.message || "";
      if (errorMsg.includes("API_KEY_INVALID") || errorMsg.includes("not found")) {
        throw new Error(`API anahtarınız geçersiz veya süresi dolmuş. (Detay: ${errorMsg})`);
      }
      if (errorMsg.includes("quota") || errorMsg.includes("429")) {
        throw new Error(`Kullanım kotanız doldu. Lütfen biraz bekleyin veya yeni bir anahtar deneyin. (Detay: ${errorMsg})`);
      }
      throw new Error(`Bir hata oluştu: ${errorMsg} (Model: ${model})`);
    }
  }
}

export const gemini = new GeminiService();
