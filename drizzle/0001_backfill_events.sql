-- Backfill synthetic events for data created before event sourcing was in place.
-- Uses created_at from the materialized rows so events appear at the correct time.
-- Only inserts events for rows that don't already have a matching event.

-- 1. user_created events for users without one
INSERT INTO events (id, party_id, user_id, type, payload, created_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  NULL,
  u.id,
  'user_created',
  json_object(
    'userId', u.id,
    'displayName', u.display_name,
    'avatarUrl', u.avatar_url,
    'oauthProvider', u.oauth_provider,
    'oauthId', u.oauth_id,
    '_backfilled', json('true')
  ),
  u.created_at
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM events e
  WHERE e.user_id = u.id
    AND e.type = 'user_created'
    AND e.undone_at IS NULL
);
--> statement-breakpoint

-- 2. party_created events for parties without one
INSERT INTO events (id, party_id, user_id, type, payload, created_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  p.id,
  p.leader_id,
  'party_created',
  json_object(
    'partyId', p.id,
    'name', p.name,
    'description', p.description,
    'leaderId', p.leader_id,
    'languages', json(p.languages),
    'groupChatLink', p.group_chat_link,
    'autoPromoteDate', p.auto_promote_date,
    '_backfilled', json('true')
  ),
  p.created_at
FROM parties p
WHERE NOT EXISTS (
  SELECT 1 FROM events e
  WHERE e.party_id = p.id
    AND e.type = 'party_created'
    AND e.undone_at IS NULL
);
--> statement-breakpoint

-- 3. party_locked events for locked parties without one
INSERT INTO events (id, party_id, user_id, type, payload, created_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  p.id,
  p.leader_id,
  'party_locked',
  json_object(
    'partyId', p.id,
    '_backfilled', json('true')
  ),
  p.created_at
FROM parties p
WHERE p.status = 'locked'
  AND NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.party_id = p.id
      AND e.type = 'party_locked'
      AND e.undone_at IS NULL
  );
--> statement-breakpoint

-- 4. member_joined events for members without one
INSERT INTO events (id, party_id, user_id, type, payload, created_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  pm.party_id,
  pm.user_id,
  'member_joined',
  json_object(
    'partyId', pm.party_id,
    'userId', pm.user_id,
    '_backfilled', json('true')
  ),
  pm.joined_at
FROM party_members pm
WHERE NOT EXISTS (
  SELECT 1 FROM events e
  WHERE e.party_id = pm.party_id
    AND e.user_id = pm.user_id
    AND e.type = 'member_joined'
    AND e.undone_at IS NULL
);
--> statement-breakpoint

-- 5. claim_placed events for claims without one
INSERT INTO events (id, party_id, user_id, type, payload, created_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  cc.party_id,
  cc.user_id,
  'claim_placed',
  json_object(
    'claimId', cc.id,
    'characterId', cc.character_id,
    'claimType', cc.claim_type,
    'rank', cc.rank,
    '_backfilled', json('true')
  ),
  cc.created_at
FROM character_claims cc
WHERE NOT EXISTS (
  SELECT 1 FROM events e
  WHERE e.type = 'claim_placed'
    AND json_extract(e.payload, '$.claimId') = cc.id
    AND e.undone_at IS NULL
);
