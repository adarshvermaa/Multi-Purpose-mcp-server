import { PineconeService } from "./pinecone.service";
import embeddingService from "./embedding.service";
import { Conversation } from "../schemas/builder/builder.ai";
import { v4 as uuidv4 } from "uuid";

class ConversationService {
  private indexInitialized = false;

  /**
   * Initialize Pinecone index if not already initialized
   */
  private async ensureIndexInitialized() {
    if (!this.indexInitialized) {
      try {
        await PineconeService.init();
        this.indexInitialized = true;
        console.log('[ConversationService] Pinecone initialized successfully');
      } catch (error: any) {
        console.warn('[ConversationService] Pinecone initialization failed, continuing without vector storage:', error.message);
        // Don't throw - allow service to continue without Pinecone
        this.indexInitialized = false;
      }
    }
  }

  /**
   * Store a conversation in Pinecone vector database
   * @param conversation - Conversation object to store
   * @returns Conversation ID
   */
  async storeConversation(conversation: Conversation): Promise<string> {
    try {
      await this.ensureIndexInitialized();
      
      // Skip if Pinecone is not available
      if (!this.indexInitialized) {
        console.warn('[ConversationService] Skipping conversation storage - Pinecone not available');
        return conversation.conversationId || `conv_${uuidv4()}`;
      }

      // Create a text representation for embedding
      const textForEmbedding = `
Project: ${conversation.projectName}
Prompt: ${conversation.userPrompt}
Structure: ${JSON.stringify(conversation.tree)}
      `.trim();

      // Generate embedding
      const embedding = await embeddingService.generateEmbedding(
        textForEmbedding
      );

      // Create unique ID
      const vectorId = conversation.conversationId || `conv_${uuidv4()}`;

      // Prepare metadata (Pinecone limits metadata size, so we stringify complex objects)
      const metadata = {
        projectId: conversation.projectId,
        projectName: conversation.projectName,
        userPrompt: conversation.userPrompt,
        treeStructure: JSON.stringify(conversation.tree),
        filesGenerated: conversation.filesGenerated,
        timestamp: conversation.timestamp,
        aiModel: conversation.metadata?.aiModel || "",
        tags: JSON.stringify(conversation.metadata?.tags || []),
      };

      // Upsert to Pinecone
      await PineconeService.upsert(vectorId, embedding, metadata);

      console.log(
        `[ConversationService] Stored conversation ${vectorId} for project ${conversation.projectName}`
      );

      return vectorId;
    } catch (error: any) {
      console.error(
        "[ConversationService] Error storing conversation:",
        error
      );
      // Don't throw - just log the error and return a conversation ID
      console.warn('[ConversationService] Continuing without storage');
      return conversation.conversationId || `conv_${uuidv4()}`;
    }
  }

  /**
   * Query Pinecone for relevant conversations based on user prompt
   * @param query - User's prompt/query
   * @param topK - Number of results to return (default: 5)
   * @returns Array of relevant conversations with similarity scores
   */
  async queryRelevantConversations(
    query: string,
    topK: number = 5
  ): Promise<
    Array<{
      conversationId: string;
      projectName: string;
      userPrompt: string;
      tree: any;
      score: number;
    }>
  > {
    try {
      await this.ensureIndexInitialized();
      
      // Return empty if Pinecone not available
      if (!this.indexInitialized) {
        console.warn('[ConversationService] Skipping RAG query - Pinecone not available');
        return [];
      }

      // Generate embedding for query
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Query Pinecone
      const results = await PineconeService.query(queryEmbedding, topK);

      // Parse and format results
      return results
        .filter((r: any) => r.metadata && r.score > 0.5) // Filter low similarity scores
        .map((r: any) => ({
          conversationId: r.id,
          projectName: r.metadata.projectName || "",
          userPrompt: r.metadata.userPrompt || "",
          tree: r.metadata.treeStructure
            ? JSON.parse(r.metadata.treeStructure)
            : [],
          score: r.score,
        }));
    } catch (error: any) {
      console.error(
        "[ConversationService] Error querying conversations:",
        error
      );
      // Don't throw error for query failures - return empty array as fallback
      console.warn(
        "[ConversationService] Returning empty results due to query error"
      );
      return [];
    }
  }

  /**
   * Get conversation history by project ID
   * Note: This is a simplified version - in production you'd want a separate metadata store
   * @param projectId - Project ID to retrieve
   * @returns Conversation data or null if not found
   */
  async getConversationHistory(projectId: string): Promise<Conversation | null> {
    try {
      await this.ensureIndexInitialized();

      // Query by embedding the project ID (not ideal, but works for demo)
      // In production, use Pinecone's metadata filtering or a separate database
      const results = await PineconeService.query(
        await embeddingService.generateEmbedding(projectId),
        1
      );

      if (results.length === 0 || !results[0].metadata) {
        return null;
      }

      const metadata = results[0].metadata;

      return {
        conversationId: results[0].id,
        projectId: metadata.projectId || projectId,
        projectName: metadata.projectName || "",
        userPrompt: metadata.userPrompt || "",
        tree: metadata.treeStructure
          ? JSON.parse(metadata.treeStructure)
          : [],
        filesGenerated: metadata.filesGenerated || 0,
        timestamp: metadata.timestamp || new Date().toISOString(),
        metadata: {
          aiModel: metadata.aiModel || "",
          tags: metadata.tags ? JSON.parse(metadata.tags) : [],
        },
      };
    } catch (error: any) {
      console.error(
        "[ConversationService] Error getting conversation history:",
        error
      );
      return null;
    }
  }

  /**
   * Check if service is properly configured
   */
  isConfigured(): boolean {
    return embeddingService.isConfigured() && !!process.env.PINECONE_API_KEY;
  }
}

export default new ConversationService();
