import { getSessionUser, type Env } from "../_auth";

/** POST /api/parties/create — create a new party */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await context.request.json() as {
    name: string;
    languages: string[];
    description?: string;
    groupChatLink?: string;
  };

  if (!body.name || body.name.trim().length === 0) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  if (!body.languages || body.languages.length === 0) {
    return Response.json({ error: "At least one language is required" }, { status: 400 });
  }

  const partyId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // Create party
  await context.env.DB.prepare(
    `INSERT INTO parties (id, name, description, leader_id, status, group_chat_link, languages, auto_promote_date, created_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, '2026-05-08', ?)`,
  )
    .bind(
      partyId,
      body.name.trim(),
      body.description?.trim() || null,
      user.id,
      body.groupChatLink?.trim() || null,
      JSON.stringify(body.languages),
      now,
    )
    .run();

  // Leader automatically joins as a member
  await context.env.DB.prepare(
    "INSERT INTO party_members (party_id, user_id, joined_at) VALUES (?, ?, ?)",
  )
    .bind(partyId, user.id, now)
    .run();

  return Response.json({ ok: true, partyId });
};
