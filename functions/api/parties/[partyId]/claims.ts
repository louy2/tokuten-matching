import { getSessionUser, type Env } from "../../_auth";

/** POST /api/parties/:partyId/claims — place a claim */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const partyId = context.params.partyId as string;
  const db = context.env.DB;

  const body = await context.request.json() as {
    characterId: number;
    claimType: "preference" | "conditional" | "claimed";
    rank?: number | null;
  };

  const { characterId, claimType, rank } = body;

  // Validate character ID
  if (!Number.isInteger(characterId) || characterId < 1 || characterId > 12) {
    return Response.json({ error: "invalid_character" }, { status: 400 });
  }

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

  // Check membership
  const member = await db
    .prepare("SELECT 1 FROM party_members WHERE party_id = ? AND user_id = ?")
    .bind(partyId, user.id)
    .first();

  if (!member) {
    return Response.json({ error: "not_a_member" }, { status: 403 });
  }

  // Validate claim-type-specific rules
  if (claimType === "claimed") {
    // Check user doesn't already have a claimed
    const existingUserClaim = await db
      .prepare(
        "SELECT 1 FROM character_claims WHERE party_id = ? AND user_id = ? AND claim_type = 'claimed'",
      )
      .bind(partyId, user.id)
      .first();
    if (existingUserClaim) {
      return Response.json({ error: "user_already_claimed_another" }, { status: 409 });
    }

    // Check character isn't already claimed
    const existingCharClaim = await db
      .prepare(
        "SELECT 1 FROM character_claims WHERE party_id = ? AND character_id = ? AND claim_type = 'claimed'",
      )
      .bind(partyId, characterId)
      .first();
    if (existingCharClaim) {
      return Response.json({ error: "character_already_claimed" }, { status: 409 });
    }

    // Displace any conditional on this character
    await db
      .prepare(
        "DELETE FROM character_claims WHERE party_id = ? AND character_id = ? AND claim_type = 'conditional'",
      )
      .bind(partyId, characterId)
      .run();
  }

  if (claimType === "conditional") {
    // Check no existing conditional on this character
    const existingCond = await db
      .prepare(
        "SELECT 1 FROM character_claims WHERE party_id = ? AND character_id = ? AND claim_type = 'conditional'",
      )
      .bind(partyId, characterId)
      .first();
    if (existingCond) {
      return Response.json({ error: "character_already_has_conditional" }, { status: 409 });
    }
  }

  // Insert the claim
  const claimId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO character_claims (id, party_id, character_id, user_id, claim_type, rank, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(claimId, partyId, characterId, user.id, claimType, rank ?? null, Math.floor(Date.now() / 1000))
    .run();

  return Response.json({ ok: true, claimId });
};
