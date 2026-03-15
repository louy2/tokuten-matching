interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
}

/** GET /api/parties/:partyId — party detail with members and claims */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const partyId = context.params.partyId as string;

  const [party, members, claims] = await Promise.all([
    context.env.DB.prepare("SELECT * FROM parties WHERE id = ?")
      .bind(partyId)
      .first(),
    context.env.DB.prepare(
      `SELECT pm.user_id, u.display_name, u.avatar_url, pm.joined_at
       FROM party_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.party_id = ?`,
    )
      .bind(partyId)
      .all(),
    context.env.DB.prepare(
      `SELECT cc.character_id, cc.user_id, u.display_name, cc.claim_type, cc.rank
       FROM character_claims cc
       JOIN users u ON u.id = cc.user_id
       WHERE cc.party_id = ?`,
    )
      .bind(partyId)
      .all(),
  ]);

  if (!party) {
    return Response.json({ error: "Party not found" }, { status: 404 });
  }

  return Response.json({
    ...party,
    members: members.results,
    claims: claims.results,
  });
};
