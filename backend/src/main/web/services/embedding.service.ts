import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

class EmbeddingService {
  /**
   * Generate embedding for a single text input
   * @param text - Text to generate embedding for
   * @returns 1024-dimensional vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error("Text cannot be empty");
      }

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        encoding_format: "float",
        dimensions: EMBEDDING_DIMENSIONS,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error("No embedding data returned from OpenAI");
      }

      return response.data[0].embedding;
    } catch (error: any) {
      console.error("[EmbeddingService] Error generating embedding:", error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param texts - Array of texts to generate embeddings for
   * @returns Array of 1024-dimensional vectors
   */
  async generateBatch(texts: string[]): Promise<number[][]> {
    try {
      if (!texts || texts.length === 0) {
        throw new Error("Texts array cannot be empty");
      }

      // Filter out empty texts
      const validTexts = texts.filter((t) => t && t.trim().length > 0);
      if (validTexts.length === 0) {
        throw new Error("All texts are empty");
      }

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: validTexts,
        encoding_format: "float",
        dimensions: EMBEDDING_DIMENSIONS,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error("No embedding data returned from OpenAI");
      }

      return response.data.map((item) => item.embedding);
    } catch (error: any) {
      console.error(
        "[EmbeddingService] Error generating batch embeddings:",
        error
      );
      throw new Error(`Batch embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Get embedding dimensions (useful for validation)
   */
  getEmbeddingDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  /**
   * Check if OpenAI API key is configured
   */
  isConfigured(): boolean {
    return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0);
  }
}

export default new EmbeddingService();
