import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 若遇到憑證問題再暫時打開
  // ssl: { rejectUnauthorized: false },
});

const SurveySchema = z.object({
  district: z.string().min(1),
  routeName: z.string().min(1),
  operator: z.string().min(1),
  surveyDate: z.string().min(1),
  surveyTime: z.string().min(1),
  surveyor: z.string().min(1),
  surveyType: z.enum(['regular', 'free', 'happiness']),
}).passthrough(); // 其他欄位也允許（例如預約相關）

// 工具：讀 raw JSON（某些情況下 @vercel/node 不會自動 parse）
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  // === CORS（不同網域時需要；同網域保留也不影響） ===
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 健康檢查（方便你直接在瀏覽器開 /api/submitSurvey）
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, message: 'submitSurvey API is alive' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body ?? (await readJson(req));
    const parsed = SurveySchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', detail: parsed.error.flatten() });
    }

    // 寫入 JSONB，並回傳 id & created_at 以便前端顯示/追蹤
    const result = await pool.query(
      `INSERT INTO survey_submissions_json (survey_data)
       VALUES ($1)
       RETURNING id, created_at`,
      [body]
    );
    const { id, created_at } = result.rows[0];

    return res.status(200).json({ ok: true, id, created_at });
  } catch (e) {
    console.error('DB write failed:', e);
    return res.status(500).json({ error: 'DB write failed' });
  }
}
