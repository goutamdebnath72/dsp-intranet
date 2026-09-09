// src/lib/ai/embedding.service.ts
import { getDb } from "@/lib/db";
import { TDocument } from "pdf-to-text";
import https from "https";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Executes a POST request to Nomic.
 * Uses native https with explicit SNI and cipher suite;
 * falls back to macOS system curl if OpenSSL triggers Cloudflare TLS Alert 40.
 */
async function postNomicEmbedding(apiKey: string, bodyObj: any): Promise<any> {
  const urlStr = "https://api.nomic.ai/v1/embedding/text";
  const postData = JSON.stringify(bodyObj);

  // Attempt 1: Node https with explicit SNI and standard ciphers
  try {
    const res = await new Promise<any>((resolve, reject) => {
      const url = new URL(urlStr);
      const req = https.request(
        {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: "POST",
          servername: url.hostname, // Explicit SNI required by Cloudflare
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0",
            "Content-Length": Buffer.byteLength(postData),
          },
          ciphers: [
            "ECDHE-ECDSA-AES128-GCM-SHA256",
            "ECDHE-RSA-AES128-GCM-SHA256",
            "ECDHE-ECDSA-AES256-GCM-SHA384",
            "ECDHE-RSA-AES256-GCM-SHA384",
            "ECDHE-ECDSA-CHACHA20-POLY1305",
            "ECDHE-RSA-CHACHA20-POLY1305",
            "AES128-GCM-SHA256",
            "AES256-GCM-SHA384",
          ].join(":"),
          minVersion: "TLSv1.2",
          maxVersion: "TLSv1.3",
        },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => {
            if (
              response.statusCode &&
              response.statusCode >= 200 &&
              response.statusCode < 300
            ) {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(new Error(`Invalid JSON: ${body}`));
              }
            } else {
              reject(new Error(`HTTP ${response.statusCode}: ${body}`));
            }
          });
        },
      );

      req.on("error", (err) => reject(err));
      req.write(postData);
      req.end();
    });

    return res;
  } catch (httpsErr: any) {
    // If macOS OpenSSL hits Cloudflare TLS Alert 40, fallback to system curl
    if (
      httpsErr?.message?.includes("SSL alert number 40") ||
      httpsErr?.code === "ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE" ||
      httpsErr?.code === "EPROTO"
    ) {
      const { stdout } = await execFileAsync("curl", [
        "-s",
        "-X",
        "POST",
        urlStr,
        "-H",
        `Authorization: Bearer ${apiKey}`,
        "-H",
        "Content-Type: application/json",
        "-d",
        postData,
      ]);
      return JSON.parse(stdout);
    }
    throw httpsErr;
  }
}

/**
 * Generates a 768-dimensional embedding vector.
 * Defaults to high-speed Nomic Cloud Inference when NOMIC_API_KEY is available.
 * Supports asymmetric Nomic task types: "search_query" (default for searching) and "search_document" (for indexing).
 * Falls back to local Ollama only if explicitly configured.
 */
export async function generateEmbedding(
  text: string,
  taskType: "search_query" | "search_document" = "search_query",
): Promise<number[]> {
  const nomicApiKey = process.env.NOMIC_API_KEY;
  const useCloud =
    process.env.AI_ENVIRONMENT !== "local" && Boolean(nomicApiKey);

  if (useCloud && nomicApiKey) {
    try {
      const data = await postNomicEmbedding(nomicApiKey, {
        model: "nomic-embed-text-v1.5",
        texts: [text],
        task_type: taskType,
        dimensionality: 768,
      });

      const vector = data?.embeddings?.[0];
      if (!vector || !Array.isArray(vector)) {
        throw new Error(
          `Invalid embedding structure returned by Nomic API: ${JSON.stringify(data)}`,
        );
      }
      return vector as number[];
    } catch (cloudErr: any) {
      console.error(
        "Nomic Cloud Embedding failed:",
        cloudErr?.message || cloudErr,
      );
      throw cloudErr;
    }
  }

  // Local Ollama fallback
  try {
    const response = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text",
        prompt: text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama request failed: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    return data.embedding as number[];
  } catch (error) {
    console.error("Failed to generate local embedding:", error);
    throw new Error("Local embedding generation failed.");
  }
}

/**
 * Extracts text from a PDF buffer (using pdf-to-text).
 */
async function extractTextFromPDF(fileBuffer: Buffer): Promise<string> {
  const { pdf } = await (eval('import("pdf-to-text")') as Promise<{
    pdf: (buffer: Buffer, options?: any) => Promise<TDocument>;
  }>);

  const data = await pdf(fileBuffer);
  const text = (Array.isArray(data) ? data.join(" ") : data) as string;
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Normalize an embedding vector to unit length.
 */
function normalizeVector(vec: number[]): number[] {
  const sumSquares = vec.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Generates embedding for a circular and stores it in DB.
 * Uses task_type "search_document" for high-fidelity document vector indexing.
 */
export async function generateAndSaveEmbedding(
  circularId: number,
  fileBuffer: Buffer,
  headline: string,
) {
  const dataSource = await getDb();

  try {
    const pdfText = await extractTextFromPDF(fileBuffer);
    const fullText = `Headline: ${headline}\n\nContent: ${pdfText}`;
    const rawEmbedding = await generateEmbedding(fullText, "search_document");

    const normalized = normalizeVector(rawEmbedding);
    const vectorString = `[${normalized.join(",")}]`;

    await dataSource.query(
      `UPDATE "circulars" SET embedding = $1 WHERE id = $2`,
      [vectorString, circularId],
    );

    console.log(`✅ AI embedding generated and saved for: ${circularId}`);
  } catch (error: any) {
    console.error(
      `⚠️ AI embedding failed for ${circularId}:`,
      error?.message ?? error,
    );
  }
}
