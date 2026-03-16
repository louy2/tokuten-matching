ALTER TABLE `users` ADD `character_preferences` text DEFAULT '[]' NOT NULL;--> statement-breakpoint

-- Remove preference-type claims: preferences now live on user profiles.
-- Record cancellation events for audit trail before deleting.
INSERT INTO events (id, party_id, user_id, type, payload, created_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  cc.party_id,
  cc.user_id,
  'claim_cancelled',
  json_object(
    'claimId', cc.id,
    'characterId', cc.character_id,
    'claimType', cc.claim_type,
    '_migration', 'preferences_moved_to_profile'
  ),
  unixepoch()
FROM character_claims cc
WHERE cc.claim_type = 'preference';--> statement-breakpoint

DELETE FROM character_claims WHERE claim_type = 'preference';