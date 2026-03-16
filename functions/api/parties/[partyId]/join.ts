import { getSessionUser, type Env } from "../../_auth";

/** POST /api/parties/:partyId/join — join a party */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const partyId = context.params.partyId as string;
  const db = context.env.DB;

  // Check party exists and is open
  const party = await db
    .prepare("SELECT status FROM parties WHERE id = ?")
    .bind(partyId)
    .first<{ status: string }>();

  if (!party) {
    return Response.json({ error: "Party not found" }, { status: 404 });
  }
  if (party.status === "locked") {
    return Response.json({ error: "party_locked" }, { status: 409 });
  }

  // Check not already a member
  const existing = await db
    .prepare("SELECT 1 FROM party_members WHERE party_id = ? AND user_id = ?")
    .bind(partyId, user.id)
    .first();

  if (existing) {
    return Response.json({ error: "already_a_member" }, { status: 409 });
  }

  // Insert membership
  await db
    .prepare("INSERT INTO party_members (party_id, user_id, joined_at) VALUES (?, ?, ?)")
    .bind(partyId, user.id, Math.floor(Date.now() / 1000))
    .run();

  return Response.json({ ok: true });
};
