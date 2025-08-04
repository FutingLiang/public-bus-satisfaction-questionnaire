import { sql } from '@vercel/postgres';

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') return res.status(200).json({ ok: true });

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const body = await readJson(req);

    // 用 ::jsonb cast，或用 sql.json(body)（@vercel/postgres 提供）
    const { rows } = await sql`
      INSERT INTO survey_submissions (survey_data)
      VALUES (${JSON.stringify(body)}::jsonb)
      RETURNING id, created_at
    `;

    return res.status(200).json({ ok: true, id: rows[0].id, created_at: rows[0].created_at });
  } catch (err) {
    console.error('DB error:', err);
    return res.status(500).json({ ok: false, error: 'DB write failed' });
  }
}
