// api/submitSurvey.js
import 'dotenv/config';
import { Pool } from 'pg';
import { z } from 'zod';

// --- 連線池：Serverless 要重用，避免每次 cold start 都重連 ---
let _pool;
function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL, // 來自 .env / Vercel env
      // 若你遇到憑證問題再暫時打開下一行（通常 sslmode=require 即可）
      // ssl: { rejectUnauthorized: false },
      // 可調整參數
      // max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000,
    });
  }
  return _pool;
}

// --- 請求體驗證（允許其它欄位 passthrough）---
const SurveySchema = z.object({
  district: z.string().min(1),
  routeName: z.string().min(1),
  operator: z.string().min(1),
  surveyDate: z.string().min(1),
  surveyTime: z.string().min(1),
  surveyor: z.string().min(1),
  surveyType: z.enum(['regular', 'free', 'happiness']),
}).passthrough();

// --- 某些環境不會自動 parse JSON：保險起見 ---
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  // CORS（同網域留著也沒關係）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // 簡易健康檢查
  if (req.method === 'GET') return res.status(200).json({ ok: true });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = await readJson(req);
    const parsed = SurveySchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', detail: parsed.error.flatten() });
    }

    const pool = getPool();
    // ⚠️ 用你目前「已存在」的表：survey_submissions
    const sql = `
      INSERT INTO survey_submissions (survey_data)
      VALUES ($1)
      RETURNING id, created_at
    `;
    const { rows } = await pool.query(sql, [body]);

    return res.status(200).json({ ok: true, ...rows[0] });
  } catch (e) {
    console.error('DB write failed:', e);
    return res.status(500).json({ error: 'DB write failed' });
  }
}
