import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 若連線出現 SSL 憑證問題，再暫時打開下行：
  // ssl: { rejectUnauthorized: false },
});

const SurveySchema = z.object({
  district: z.string().min(1),
  routeName: z.string().min(1),
  operator: z.string().min(1),
  surveyDate: z.string().min(1),
  surveyTime: z.string().min(1),
  surveyor: z.string().min(1),
  surveyType: z.enum(['regular','free','happiness']),
}).passthrough();

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

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

    const result = await pool.query(
      `INSERT INTO public.survey_submissions (survey_data)
       VALUES ($1::jsonb)
       RETURNING id, created_at`,
      [body]
    );
    const { id, created_at } = result.rows[0];
    return res.status(201).json({ ok: true, id, created_at });

  } catch (e) {
    console.error('DB write failed:', e);
    return res.status(500).json({ error: 'DB write failed', message: e.message });
  }
}
