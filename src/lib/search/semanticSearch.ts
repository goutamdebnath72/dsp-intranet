// src/lib/search/semanticSearch.ts
import { DataSource } from "typeorm";
import { generateEmbedding } from "@/lib/ai/embedding.service";
import {
  SearchResultRow,
  formatLuxonDate,
  executeTitleSearch,
} from "./titleSearch";

const DEVANAGARI_REGEX = /[\p{Script=Devanagari}]/u;
const BENGALI_REGEX = /[\p{Script=Bengali}]/u;
const INDIC_SCRIPT_REGEX = /[\p{Script=Devanagari}\p{Script=Bengali}]/u;

function normalizeVector(vec: number[]): number[] {
  const sumSquares = vec.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sumSquares) || 1;
  return vec.map((v) => v / norm);
}

// Strictly pure administrative actions and universal fillers ONLY
const PROCEDURAL_WORDS = new Set([
  "submission",
  "submitting",
  "submit",
  "application",
  "apply",
  "date",
  "last",
  "deadline",
  "due",
  "form",
  "format",
  "notice",
  "circular",
  "regarding",
  "extension",
  "rules",
  "guidelines",
  // Hindi procedural
  "आवेदन",
  "जमा",
  "करने",
  "की",
  "अंतिम",
  "तिथि",
  "सूचना",
  "फॉर्म",
  "प्रारूप",
  "दिनांक",
  "नियम",
  "निर्देशिका",
  // Bengali procedural
  "আবেদন",
  "জমা",
  "করার",
  "শেষ",
  "তারিখ",
  "বিজ্ঞপ্তি",
  "ফর্ম",
  "ফরম",
  "নথি",
  "নিয়ম",
  "নির্দেশিকা",
]);

const STOP_WORDS = new Set([
  "how",
  "do",
  "i",
  "my",
  "the",
  "before",
  "what",
  "is",
  "are",
  "can",
  "to",
  "for",
  "in",
  "on",
  "at",
  "by",
  "from",
  "with",
  "an",
  "a",
  "of",
  "and",
  "or",
  "about",
  // Hindi & Bengali connector particles
  "के",
  "का",
  "की",
  "को",
  "में",
  "पर",
  "से",
  "हो",
  "है",
  "लिए",
  "এর",
  "কে",
  "তে",
  "এবং",
  "ও",
  "বা",
  "থেকে",
  "হলো",
  "আছে",
  "জন্য",
]);

async function translateIndicQuery(indicText: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "";

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content:
              "You are an enterprise search keyword translator for a corporate circulars portal.\n" +
              "Translate the user query into 3 to 6 essential English keywords matching corporate circular titles.\n" +
              "Important enterprise domain rules:\n" +
              "- If the query mentions scholarship / छात्रवृत्ति / মেধাবৃত্তি, ALWAYS include: merit award scheme\n" +
              "- If the query mentions contract workers / संविदा / ঠিকা, ALWAYS include: contract workers\n" +
              "- Preserve any 4-digit years (such as 2024, 2025, 2026).\n" +
              "Output ONLY space-separated English words and years without punctuation.",
          },
          {
            role: "user",
            content: indicText,
          },
        ],
        temperature: 0.0,
        max_tokens: 350,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const message = data.choices?.[0]?.message;
      const translated = (message?.content || "").trim();
      if (translated) {
        return translated.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
      }
    }
  } catch (err) {
    console.warn("[Groq Translation Error]:", err);
  }

  return "";
}

async function filterRelevantCirculars(
  userQuery: string,
  englishContext: string,
  candidates: SearchResultRow[],
): Promise<SearchResultRow[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || candidates.length <= 1) return candidates;

  try {
    const candidateSummary = candidates.map((c) => ({
      id: c.id,
      headline: c.headline,
    }));

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content:
              "You are a strict enterprise search relevance evaluator.\n" +
              "Your task is to identify and retain ONLY circulars that directly match the primary subject of the user's query.\n" +
              "Evaluation Rules:\n" +
              "1. Match the core activity/subject precisely:\n" +
              "   - 'Table Tennis' must match Table Tennis, strictly excluding other sports and general notices.\n" +
              "   - 'Scholarship / Merit Schemes' must match Merit Award Schemes, strictly excluding accommodation, gift cards, or leaves.\n" +
              "   - 'Motivational Award Schemes' must match motivational/suggestion schemes, strictly excluding student merit awards.\n" +
              "   - 'Format B / SIR' must match SIR declarations.\n" +
              "2. KEEP ALL language editions (English, Hindi, Bengali) of any genuinely matching circular.\n" +
              "3. Discard circulars about completely different subjects.\n" +
              "Return ONLY a JSON array of matching integer IDs, e.g. [12] or [12, 14].",
          },
          {
            role: "user",
            content: `User Query: "${userQuery}"\nIntent: "${englishContext}"\nCandidates: ${JSON.stringify(candidateSummary)}`,
          },
        ],
        temperature: 0.0,
        max_tokens: 350,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const message = data.choices?.[0]?.message;
      const content = (message?.content || "").trim();
      const matchedIds = content.match(/\d+/g);
      if (matchedIds && matchedIds.length > 0) {
        const idSet = new Set(matchedIds.map(Number));
        const filtered = candidates.filter((c) => idSet.has(c.id));
        if (filtered.length > 0) {
          return filtered;
        }
      }
    }
  } catch (err) {
    console.warn("AI Relevance Filter error:", err);
  }

  return candidates;
}

export async function executeSemanticSearch(
  dataSource: DataSource,
  q: string,
): Promise<{ uniqueResults: SearchResultRow[]; isFallback: boolean }> {
  const safeQ = (q || "").trim();
  const isDevanagari = DEVANAGARI_REGEX.test(safeQ);
  const isBengali = BENGALI_REGEX.test(safeQ);
  const isIndic = INDIC_SCRIPT_REGEX.test(safeQ);

  const nativeIndicTokens = safeQ
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(
      (t) => t.length >= 2 && !STOP_WORDS.has(t) && !PROCEDURAL_WORDS.has(t),
    );

  let translatedQuery = "";
  if (isIndic) {
    translatedQuery = await translateIndicQuery(safeQ);
  }

  const effectiveQuery = translatedQuery.length > 2 ? translatedQuery : safeQ;

  const searchByKeywords = async (
    englishKeywords: string,
    nativeTokens: string[],
  ) => {
    const rawEnglishTokens = englishKeywords
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));

    const yearTokens = [
      ...rawEnglishTokens.filter((t) => /^\d{4}$/.test(t)),
      ...nativeTokens.filter((t) => /^\d{4}$/.test(t)),
    ];

    const nonYearEnglish = rawEnglishTokens.filter((t) => !/^\d{4}$/.test(t));
    const englishSubject = nonYearEnglish.filter(
      (t) => !PROCEDURAL_WORDS.has(t.toLowerCase()),
    );
    const englishProc = nonYearEnglish.filter((t) =>
      PROCEDURAL_WORDS.has(t.toLowerCase()),
    );

    const effectiveSubjectTokens =
      englishSubject.length > 0 ? englishSubject : nonYearEnglish;

    const nativeSubjectTokens = nativeTokens.filter((t) => !/^\d{4}$/.test(t));
    const coreSubjectTokens = [
      ...effectiveSubjectTokens,
      ...nativeSubjectTokens,
    ];

    if (coreSubjectTokens.length === 0 && rawEnglishTokens.length === 0)
      return [];

    const activeSubjectTokens =
      coreSubjectTokens.length > 0 ? coreSubjectTokens : rawEnglishTokens;

    const params: string[] = [];

    const subjectConditions = activeSubjectTokens.map((t) => {
      params.push(`%${t}%`);
      const idx = params.length;
      return `(c.headline ILIKE $${idx} OR cc.text ILIKE $${idx})`;
    });

    // Primary Subject Scoring: Headline = 25 pts, Chunk = 8 pts
    const subjectScoreExpressions = activeSubjectTokens.map((_, i) => {
      const idx = i + 1;
      return `(CASE WHEN c.headline ILIKE $${idx} THEN 25 ELSE 0 END + CASE WHEN cc.text ILIKE $${idx} THEN 8 ELSE 0 END)`;
    });
    const subjectScoreSql = `(${subjectScoreExpressions.join(" + ")})`;

    // Procedural modifier scoring: Headline = 2 pts, Chunk = 1 pt
    let proceduralScoreSql = `0`;
    if (englishProc.length > 0 && englishSubject.length > 0) {
      const procExpressions = englishProc.map((t) => {
        params.push(`%${t}%`);
        const idx = params.length;
        return `(CASE WHEN c.headline ILIKE $${idx} THEN 2 ELSE 0 END + CASE WHEN cc.text ILIKE $${idx} THEN 1 ELSE 0 END)`;
      });
      proceduralScoreSql = `(${procExpressions.join(" + ")})`;
    }

    // Year Bonus: Only awarded if user explicitly mentioned a year
    let yearScoreSql = `0`;
    if (yearTokens.length > 0) {
      const yearConditions = yearTokens.map((y) => {
        params.push(`%${y}%`);
        const idx = params.length;
        return `(c.headline ILIKE $${idx} OR TO_CHAR(c."publishedAt", 'YYYY') = '${y}')`;
      });
      yearScoreSql = `(CASE WHEN ${yearConditions.join(" OR ")} THEN 30 ELSE 0 END)`;
    }

    // Decisive Language Precedence Ladder (+40 pts for matching language edition)
    let languageBonusSql = `0`;
    if (isDevanagari) {
      languageBonusSql = `(CASE WHEN c.headline ILIKE '%(hindi)%' OR c.headline ILIKE '%hindi%' THEN 40 ELSE 0 END)`;
    } else if (isBengali) {
      languageBonusSql = `(CASE WHEN c.headline ILIKE '%(beng)%' OR c.headline ILIKE '%bengali%' THEN 40 ELSE 0 END)`;
    } else {
      languageBonusSql = `(CASE WHEN c.headline ILIKE '%(eng%' OR c.headline ILIKE '%english%' THEN 20 ELSE 0 END)`;
    }

    const MIN_SUBJECT_SCORE = 15;

    const rows = await dataSource.query<any[]>(
      `
      SELECT 
        c.id,
        c.headline,
        c."fileUrls",
        c."publishedAt",
        cc.text AS "chunkText",
        (${subjectScoreSql} + ${proceduralScoreSql} + ${yearScoreSql} + ${languageBonusSql}) AS match_score,
        ${subjectScoreSql} AS subject_score
      FROM circulars c
      LEFT JOIN circular_chunks cc ON cc.circular_id = c.id
      WHERE (${subjectConditions.join(" OR ")})
        AND (${subjectScoreSql}) >= ${MIN_SUBJECT_SCORE}
      ORDER BY match_score DESC, c.id DESC
      LIMIT 25;
      `,
      params,
    );

    if (!rows || rows.length === 0) return [];

    const topScore = Math.max(...rows.map((r) => Number(r.match_score) || 1));

    const docMap = new Map<number, SearchResultRow>();
    for (const m of rows) {
      const score = Number(m.match_score) || 0;
      const relativeRatio = score / topScore;

      if (relativeRatio < 0.35) continue;

      const calculatedSimilarity = Number(
        Math.min(0.98, Math.max(0.7, relativeRatio * 0.98)).toFixed(2),
      );

      const existing = docMap.get(m.id);
      if (!existing) {
        docMap.set(m.id, {
          id: m.id,
          type: "circular" as const,
          headline: m.headline,
          url:
            Array.isArray(m.fileUrls) && m.fileUrls.length > 0
              ? m.fileUrls[0]
              : null,
          publishedAt: formatLuxonDate(m.publishedAt),
          similarity: calculatedSimilarity,
          chunkText: m.chunkText || "",
        });
      } else if (
        existing.chunkText &&
        m.chunkText &&
        !existing.chunkText.includes(m.chunkText)
      ) {
        existing.chunkText += `\n\n${m.chunkText}`;
      }
    }

    const candidateResults = Array.from(docMap.values()).slice(0, 10);
    return await filterRelevantCirculars(
      safeQ,
      effectiveQuery,
      candidateResults,
    );
  };

  if (!isIndic) {
    try {
      const raw = await generateEmbedding(effectiveQuery);
      const queryEmbedding = normalizeVector(raw);
      const vectorString = `[${queryEmbedding.join(",")}]`;

      const matches = await dataSource.query<any[]>(
        `
        SELECT 
          c.id,
          c.headline,
          c."fileUrls",
          c."publishedAt",
          cc.text AS "chunkText",
          (1 - (cc.embedding <=> $1::vector(768))) AS similarity
        FROM circular_chunks cc
        JOIN circulars c ON c.id = cc.circular_id
        WHERE cc.embedding IS NOT NULL
        ORDER BY similarity DESC
        LIMIT 10;
        `,
        [vectorString],
      );

      if (matches && matches.length > 0) {
        const docMap = new Map<number, SearchResultRow>();
        for (const m of matches) {
          const existing = docMap.get(m.id);
          if (!existing) {
            docMap.set(m.id, {
              id: m.id,
              type: "circular",
              headline: m.headline,
              url:
                Array.isArray(m.fileUrls) && m.fileUrls.length > 0
                  ? m.fileUrls[0]
                  : null,
              publishedAt: formatLuxonDate(m.publishedAt),
              similarity: Number(Number(m.similarity).toFixed(4)),
              chunkText: m.chunkText || "",
            });
          } else if (
            existing.chunkText &&
            m.chunkText &&
            !existing.chunkText.includes(m.chunkText)
          ) {
            existing.chunkText += `\n\n${m.chunkText}`;
          }
        }

        const candidateVectorResults = Array.from(docMap.values());
        const verified = await filterRelevantCirculars(
          safeQ,
          effectiveQuery,
          candidateVectorResults,
        );
        return { uniqueResults: verified, isFallback: false };
      }
    } catch {
      // Fall through to keyword search
    }
  }

  const results = await searchByKeywords(effectiveQuery, nativeIndicTokens);
  if (results.length > 0) {
    return { uniqueResults: results, isFallback: true };
  }

  const titleFallback = await executeTitleSearch(dataSource, effectiveQuery);
  return { uniqueResults: titleFallback, isFallback: true };
}
