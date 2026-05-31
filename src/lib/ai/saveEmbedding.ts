// src/lib/ai/saveEmbedding.ts
import { getDb } from "@/lib/db";

/**
 * Save a numeric embedding array into the Postgres `vector` column.
 * - id: circulars.id
 * - embedding: number[] (plain JS numbers)
 * - dim: vector dimension (default 768 for nomic-embed-text)
 */
export async function saveEmbeddingToVectorTable(
  id: number,
  embedding: number[],
  dim = 768
) {
  if (!Array.isArray(embedding) || embedding.length === 0) return;

  // Ensure length matches expected dim
  if (embedding.length !== dim) {
    throw new Error(
      `Embedding length ${embedding.length} does not match expected dim ${dim}`
    );
  }

  const db = await getDb();
  const sequelize = db.sequelize;

  // Postgres vector literal: '[x,y,z]'
  const vecLiteral = `[${embedding.join(",")}]`;

  // ⭐ Correct cast -> ::vector (NOT public.vector)
  const sql = `UPDATE public.circulars
               SET embedding = $1::vector
               WHERE id = $2`;

  try {
    await sequelize.query(sql, {
      bind: [vecLiteral, id],
      type: sequelize.QueryTypes.UPDATE,
    });
  } catch (err) {
    console.error("saveEmbeddingToVectorTable failed:", err);
    throw err;
  }
}

export default saveEmbeddingToVectorTable;
