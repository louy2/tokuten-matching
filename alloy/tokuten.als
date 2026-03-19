/**
 * Alloy model of the Tokuten Matching data schema and business rules.
 *
 * Domain: fans form Parties of up to 12 people to split-buy a limited
 * tokuten set containing 12 character cards.  Each character slot moves
 * through: open -> wanted -> conditional -> claimed (or contested when
 * 2+ conditionals).
 *
 * Character Slot States (derived from claims):
 *   OPEN       – no preferences, no conditional, no claimed
 *   WANTED     – 1+ preferences exist, but no conditional or claimed
 *   CONDITIONAL – exactly one conditional claim
 *   CONTESTED  – 2+ conditional claims (needs discussion)
 *   CLAIMED    – someone has a full "claimed" on this character
 *
 * Per-user limits:
 *   - Multiple full claims allowed per user per party (one per character)
 *   - Unlimited conditional claims across different characters
 *   - At most 1 conditional per user per character per party
 *
 * We model the *static* data invariants that the application must maintain
 * at every observable state, then ask Alloy to check them.
 */

-- Enums

abstract sig ClaimType {}
one sig Preference, Conditional, Claimed extends ClaimType {}

abstract sig PartyStatus {}
one sig Open, Locked extends PartyStatus {}

-- Core sigs

sig Character {}

sig User {}

sig Party {
  status   : one PartyStatus,
  leader   : one User,
  members  : set User,
  setPrice : one Int       -- configurable per party (yen)
}

sig CharacterClaim {
  party     : one Party,
  character : one Character,
  owner     : one User,
  claimType : one ClaimType,
  rank      : lone Int
}

-- World-level facts

fact CharacterBound {
  #Character <= 12
}

fact PartyMembershipBound {
  all p : Party | #p.members <= 12
}

fact LeaderIsMember {
  all p : Party | p.leader in p.members
}

fact ClaimantIsMember {
  all c : CharacterClaim | c.owner in c.party.members
}

fact PreferenceHasRank {
  all c : CharacterClaim |
    c.claimType = Preference implies (some c.rank and c.rank >= 1)
}

fact NonPreferenceNoRank {
  all c : CharacterClaim |
    c.claimType != Preference implies no c.rank
}

fact AtMostOneClaimedPerCharacterPerParty {
  all p : Party, ch : Character |
    lone c : CharacterClaim |
      c.party = p and c.character = ch and c.claimType = Claimed
}

-- A user may hold multiple full claims across different characters in a party.
-- (At most one claimed per *character* is enforced by AtMostOneClaimedPerCharacterPerParty.)

-- NOTE: We deliberately removed AtMostOneConditionalPerCharacterPerParty.
-- Multiple conditionals on the same character produce a "contested" state
-- that must be resolved through external discussion.

-- A user can only place one conditional per character per party
-- (but different users CAN conditionally claim the same character).
fact AtMostOneConditionalPerUserPerCharacterPerParty {
  all p : Party, u : User, ch : Character |
    lone c : CharacterClaim |
      c.party = p and c.owner = u and c.character = ch and c.claimType = Conditional
}

fact DisplacementRule {
  -- If a character is claimed in a party, no conditional for it exists
  all p : Party, ch : Character |
    (some c : CharacterClaim |
      c.party = p and c.character = ch and c.claimType = Claimed)
    implies
    (no c2 : CharacterClaim |
      c2.party = p and c2.character = ch and c2.claimType = Conditional)
}

-- Preference is a partial ranking: not all characters need a rank,
-- two characters CAN share the same rank, but a user can only rank
-- a given character once per party.
fact AtMostOnePreferencePerUserPerCharacterPerParty {
  all p : Party, u : User, ch : Character |
    lone c : CharacterClaim |
      c.party = p and c.owner = u and c.character = ch and c.claimType = Preference
}

-- Set price must be positive
fact PositiveSetPrice {
  all p : Party | p.setPrice > 0
}

-- Assertions (properties to verify)

-- 1. No orphan claims: every claim belongs to a party member
assert NoOrphanClaims {
  all c : CharacterClaim | c.owner in c.party.members
}

-- 2. Claimed exclusivity: at most one claimed per character per party
assert ClaimedExclusivity {
  all p : Party, ch : Character |
    #{c : CharacterClaim |
      c.party = p and c.character = ch and c.claimType = Claimed} <= 1
}

-- 3. Multi-character claims: a user can hold multiple full claims (one per character)
assert MultiCharacterClaimsAllowed {
  -- This is a "smoke" assertion: the model should allow instances where
  -- a single user has 2+ full claims on different characters.
  -- We verify this via ShowMultiClaim below; this assertion simply checks
  -- that every claimed character has at most one claimer (already a fact).
  all p : Party, ch : Character |
    #{c : CharacterClaim |
      c.party = p and c.character = ch and c.claimType = Claimed} <= 1
}

-- 4. Displacement invariant: claimed and conditional never coexist on same character
assert DisplacementInvariant {
  no p : Party, ch : Character |
    (some c1 : CharacterClaim |
      c1.party = p and c1.character = ch and c1.claimType = Claimed)
    and
    (some c2 : CharacterClaim |
      c2.party = p and c2.character = ch and c2.claimType = Conditional)
}

-- 5. Leader is always a member
assert LeaderMembership {
  all p : Party | p.leader in p.members
}

-- 6. Party size bound
assert PartySizeBound {
  all p : Party | #p.members <= 12
}

-- 7. Preference ranks are positive
assert PreferenceRanksPositive {
  all c : CharacterClaim |
    c.claimType = Preference implies c.rank >= 1
}

-- 8. One preference per user per character per party
assert OnePreferencePerUserCharacter {
  all p : Party, u : User, ch : Character |
    #{c : CharacterClaim |
      c.party = p and c.owner = u and c.character = ch and c.claimType = Preference} <= 1
}

-- 9. One conditional per user per character per party
assert OneConditionalPerUserPerCharacter {
  all p : Party, u : User, ch : Character |
    #{c : CharacterClaim |
      c.party = p and c.owner = u and c.character = ch and c.claimType = Conditional} <= 1
}

-- Commands

-- Show a sample valid instance with all three claim types and contested state
run ShowExample {
  #Party = 1
  #User >= 3
  #Character >= 3
  some c : CharacterClaim | c.claimType = Claimed
  some c : CharacterClaim | c.claimType = Conditional
  some c : CharacterClaim | c.claimType = Preference
  -- Show contested: 2 conditionals on same character
  some ch : Character |
    #{c : CharacterClaim | c.claimType = Conditional and c.character = ch} >= 2
} for 5 but exactly 1 Party, 4 User, 4 Character, 8 CharacterClaim, 5 Int

-- Show a user with multiple full claims on different characters
run ShowMultiClaim {
  #Party = 1
  some u : User |
    #{c : CharacterClaim | c.owner = u and c.claimType = Claimed} >= 2
} for 5 but exactly 1 Party, 3 User, 4 Character, 6 CharacterClaim, 5 Int

-- Check all assertions (5 Int = bitwidth 5, range -16..15, enough for <= 12)
check NoOrphanClaims               for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check ClaimedExclusivity            for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check MultiCharacterClaimsAllowed   for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check DisplacementInvariant         for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check LeaderMembership              for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check PartySizeBound                for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check PreferenceRanksPositive       for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check OnePreferencePerUserCharacter for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check OneConditionalPerUserPerCharacter for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
