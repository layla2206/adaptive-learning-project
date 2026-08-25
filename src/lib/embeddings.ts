import { GoogleGenerativeAI } from "@google/generative-ai";

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set in environment variables.");
  }
  return new GoogleGenerativeAI(apiKey);
};

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];

  const ai = getGeminiClient();
  const model = ai.getGenerativeModel({ model: "text-embedding-004" });

  const requests = texts.map((text) => ({
    content: { role: "user", parts: [{ text }] },
  }));

  const results: number[][] = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const batch = requests.slice(i, i + BATCH_SIZE);
    const response = await model.batchEmbedContents({
      requests: batch,
    });
    for (const embedding of response.embeddings) {
      results.push(embedding.values);
    }
  }

  return results;
}
