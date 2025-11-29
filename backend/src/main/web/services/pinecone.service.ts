import { Pinecone } from "@pinecone-database/pinecone";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || "",
});
let index: any;   

export const PineconeService = {
  async init() {
    index = pinecone.Index(process.env.PINECONE_INDEX || "");
  },

  async upsert(id: string, vector: number[], metadata: Record<string, any>) {
    if (!index) throw new Error("Pinecone not initialized");
    // Updated API: upsert expects array of records directly, not nested in vectors object
    await index.upsert([{ id, values: vector, metadata }]);
  },

  async query(vector: number[], topK = 5) {
    if (!index) throw new Error("Pinecone not initialized");
    // Updated API: query parameters are at top level, not nested in queryRequest
    const res = await index.query({
      topK,
      vector,
      includeMetadata: true,
    });
    return res.matches || [];
  },
};
