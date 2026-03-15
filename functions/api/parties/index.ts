interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
}

/** GET /api/parties — list all open parties */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const language = url.searchParams.get("language");

  let query = `
    SELECT
      p.id, p.name, p.language, p.created_at,
      COUNT(DISTINCT pm.user_id) as member_count
    FROM parties p
    LEFT JOIN party_members pm ON pm.party_id = p.id
    WHERE p.status = 'open'
  `;
  const params: string[] = [];

  if (language) {
    query += " AND p.language = ?";
    params.push(language);
  }

  query += " GROUP BY p.id ORDER BY p.created_at DESC";

  const result = await context.env.DB.prepare(query)
    .bind(...params)
    .all();

  return Response.json({ parties: result.results });
};
