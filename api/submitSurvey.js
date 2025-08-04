import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: { rejectUnauthorized: false }
});

const SurveySchema = z.object({
  district: z.string().min(1),
  routeName: z.string().min(1),
  operator: z.string().min(1),
  surveyDate: z.string().min(1),
  surveyTime: z.string().min(1),
  surveyor: z.string().min(1),
  surveyType: z.enum(['regular','free','happiness']),
}).passthrough(); // 允許其餘欄位通過

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = req.body ?? (await readJson(req)); // 若未自動 parse，手動讀 body
    const parsed = SurveySchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', detail: parsed.error.flatten() });
    }

    // 只寫 JSONB 表（最簡單）
    await pool.query(
      `INSERT INTO survey_submissions_json (survey_data) VALUES ($1)`,
      [body]
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'DB write failed' });
  }
}

// 工具：讀取 raw JSON（某些情況下 @vercel/node 不會自動 parse）
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}
