import type { CatalogItem, D1DatabaseLike } from "../types.ts";

const FORBIDDEN_SQL_PATTERN =
  /\b(insert|update|delete|drop|alter|create|replace|truncate|attach|detach|pragma|vacuum|exec|execute|union)\b/i;

export interface SqlValidationResult {
  valid: boolean;
  normalizedSql: string;
  reason?: string;
}

/**
 * Guardrail for Text-to-SQL (/sql) ensuring only single-statement read-only SELECT queries run.
 */
export function validateReadOnlySql(sql: string): SqlValidationResult {
  const cleaned = sql.trim().replace(/;+\s*$/, "");
  if (!cleaned) {
    return { valid: false, normalizedSql: "", reason: "Empty SQL query." };
  }
  if (cleaned.includes(";") || cleaned.includes("--") || cleaned.includes("/*")) {
    return { valid: false, normalizedSql: cleaned, reason: "Multi-statement or comment tokens are blocked." };
  }
  if (!/^select\s+/i.test(cleaned)) {
    return { valid: false, normalizedSql: cleaned, reason: "Only read-only SELECT queries are permitted." };
  }
  if (FORBIDDEN_SQL_PATTERN.test(cleaned)) {
    return { valid: false, normalizedSql: cleaned, reason: "Mutating or privileged SQL keyword detected." };
  }
  return { valid: true, normalizedSql: cleaned };
}

function getField(item: CatalogItem, field: string): string | number {
  switch (field.toLowerCase()) {
    case "id":
      return item.id;
    case "sku":
      return item.sku;
    case "title":
      return item.title;
    case "category":
      return item.category;
    case "price_usd":
    case "priceusd":
      return item.priceUsd;
    case "stock":
      return item.stock;
    case "rating":
      return item.rating;
    default:
      return item.title;
  }
}

/**
 * Translates natural language or executes a safe SELECT query against D1 (if bound) or the in-memory catalog.
 */
export async function executeDualSqlQuery(
  inputOrSql: string,
  catalog: CatalogItem[],
  db?: D1DatabaseLike
): Promise<{
  mode: "sql";
  sql: string;
  valid: boolean;
  rows: Array<Record<string, unknown>>;
  error?: string;
}> {
  let sql = inputOrSql.trim();
  if (!/^select\b/i.test(sql) && !FORBIDDEN_SQL_PATTERN.test(sql) && !sql.includes(";")) {
    const terms = sql.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const maxPriceMatch = /(?:under|below|kurang|<)\s*\$?(\d+)/i.exec(sql);
    if (maxPriceMatch) {
      sql = `SELECT sku, title, category, price_usd, rating FROM catalog WHERE price_usd <= ${Number(maxPriceMatch[1])} ORDER BY rating DESC LIMIT 5`;
    } else if (terms.includes("book") || terms.includes("books") || terms.includes("buku")) {
      sql = `SELECT sku, title, category, price_usd, rating FROM catalog WHERE category = 'book' ORDER BY rating DESC LIMIT 5`;
    } else if (terms.length > 0) {
      const safeWord = terms[0].replace(/[^a-z0-9_-]/g, "");
      sql = `SELECT sku, title, category, price_usd, rating FROM catalog WHERE title LIKE '%${safeWord}%' ORDER BY rating DESC LIMIT 5`;
    } else {
      sql = "SELECT sku, title, category, price_usd, rating FROM catalog ORDER BY rating DESC LIMIT 5";
    }
  }

  const check = validateReadOnlySql(sql);
  if (!check.valid) {
    return { mode: "sql", sql, valid: false, rows: [], error: check.reason };
  }

  if (db) {
    try {
      const res = await db.prepare(check.normalizedSql).all();
      return { mode: "sql", sql: check.normalizedSql, valid: true, rows: res.results };
    } catch {
      // Fall back to in-memory catalog evaluator if catalog table isn't seeded in D1 yet
    }
  }

  let rows = [...catalog];
  const whereMatch = /\bwhere\s+(.+?)(?:\s+order\s+by|\s+limit|$)/i.exec(check.normalizedSql);
  if (whereMatch) {
    const clause = whereMatch[1].trim();
    const eqMatch = /^([a-z_]+)\s*=\s*'([^']*)'$/i.exec(clause);
    const leMatch = /^([a-z_]+)\s*<=\s*(\d+(?:\.\d+)?)$/i.exec(clause);
    const geMatch = /^([a-z_]+)\s*>=\s*(\d+(?:\.\d+)?)$/i.exec(clause);
    const likeMatch = /^([a-z_]+)\s+like\s+'%([^%]*)%'$/i.exec(clause);

    if (eqMatch) {
      rows = rows.filter((item) => String(getField(item, eqMatch[1])).toLowerCase() === eqMatch[2].toLowerCase());
    } else if (leMatch) {
      rows = rows.filter((item) => Number(getField(item, leMatch[1])) <= Number(leMatch[2]));
    } else if (geMatch) {
      rows = rows.filter((item) => Number(getField(item, geMatch[1])) >= Number(geMatch[2]));
    } else if (likeMatch) {
      const needle = likeMatch[2].toLowerCase();
      rows = rows.filter(
        (item) =>
          item.title.toLowerCase().includes(needle) ||
          item.summary.toLowerCase().includes(needle) ||
          item.tags.some((t) => t.toLowerCase().includes(needle))
      );
    }
  }

  const orderMatch = /\border\s+by\s+([a-z_]+)(?:\s+(asc|desc))?/i.exec(check.normalizedSql);
  if (orderMatch) {
    const field = orderMatch[1];
    const dir = (orderMatch[2] ?? "asc").toLowerCase();
    rows.sort((a, b) => {
      const av = getField(a, field);
      const bv = getField(b, field);
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return dir === "desc" ? -cmp : cmp;
    });
  }

  const limitMatch = /\blimit\s+(\d+)/i.exec(check.normalizedSql);
  if (limitMatch) {
    rows = rows.slice(0, Math.min(50, Number(limitMatch[1])));
  }

  return {
    mode: "sql",
    sql: check.normalizedSql,
    valid: true,
    rows: rows.map((r) => ({
      sku: r.sku,
      title: r.title,
      category: r.category,
      price_usd: r.priceUsd,
      rating: r.rating
    }))
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function charTrigramVector(text: string, dims = 64): Float64Array {
  const vec = new Float64Array(dims);
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < Math.max(0, norm.length - 2); i++) {
    const tri = norm.slice(i, i + 3);
    let h = 2166136261;
    for (let j = 0; j < tri.length; j++) {
      h ^= tri.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % dims] += 1;
  }
  let mag = 0;
  for (let i = 0; i < dims; i++) mag += vec[i] * vec[i];
  const denom = Math.sqrt(mag) || 1;
  for (let i = 0; i < dims; i++) vec[i] /= denom;
  return vec;
}

function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Hybrid BM25 + Cosine Similarity RAG retriever for the /rag path (kapso-agente-yt pattern).
 */
export class HybridRagIndex {
  docs: Array<{
    item: CatalogItem;
    tokens: string[];
    tf: Map<string, number>;
    vec: Float64Array;
  }>;
  df: Map<string, number>;
  avgDocLen: number;

  constructor(catalog: CatalogItem[]) {
    this.df = new Map();
    this.docs = catalog.map((item) => {
      const fullText = `${item.title} ${item.category} ${item.summary} ${item.tags.join(" ")}`;
      const tokens = tokenize(fullText);
      const tf = new Map<string, number>();
      const seen = new Set<string>();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) ?? 0) + 1);
        if (!seen.has(t)) {
          seen.add(t);
          this.df.set(t, (this.df.get(t) ?? 0) + 1);
        }
      }
      return { item, tokens, tf, vec: charTrigramVector(fullText) };
    });
    const totalLen = this.docs.reduce((acc, d) => acc + d.tokens.length, 0);
    this.avgDocLen = this.docs.length ? totalLen / this.docs.length : 1;
  }

  search(query: string, topK = 3): Array<{ item: CatalogItem; score: number; bm25: number; cosine: number }> {
    const qTokens = tokenize(query);
    const qVec = charTrigramVector(query);
    const N = this.docs.length || 1;
    const k1 = 1.5;
    const b = 0.75;

    const scored = this.docs.map((doc) => {
      let bm25 = 0;
      for (const qt of qTokens) {
        const tf = doc.tf.get(qt) ?? 0;
        if (tf === 0) continue;
        const df = this.df.get(qt) ?? 0;
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        const denom = tf + k1 * (1 - b + b * (doc.tokens.length / this.avgDocLen));
        bm25 += idf * ((tf * (k1 + 1)) / denom);
      }
      const cosine = cosineSimilarity(qVec, doc.vec);
      const score = Number((bm25 * 0.7 + cosine * 3.0).toFixed(4));
      return { item: doc.item, score, bm25: Number(bm25.toFixed(4)), cosine: Number(cosine.toFixed(4)) };
    });

    return scored
      .sort((a, bDoc) => bDoc.score - a.score)
      .slice(0, topK);
  }
}
