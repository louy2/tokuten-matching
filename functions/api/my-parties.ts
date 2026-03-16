import { getSessionUser, type Env } from "./_auth";

/** GET /api/my-parties — list parties the current user is in */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return Response.json({ parties: [] });
  }

  const result = await context.env.DB.prepare(
    `SELECT
       p.id, p.name, p.status, p.languages, p.leader_id, p.created_at,
       (SELECT COUNT(*) FROM party_members pm WHERE pm.party_id = p.id) AS member_count,
       (SELECT COUNT(*) FROM character_claims cc WHERE cc.party_id = p.id AND cc.claim_type = 'claimed') AS claimed_count
     FROM parties p
     JOIN party_members pm ON pm.party_id = p.id
     WHERE pm.user_id = ?
     ORDER BY p.created_at DESC`,
  )
    .bind(user.id)
    .all();

  return Response.json({ parties: result.results });
};
