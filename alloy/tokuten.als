/**
 * Alloy model of the Tokuten Matching data schema and business rules.
 *
 * Domain: fans form Parties of up to 12 people to split-buy a limited
 * tokuten set containing 12 character cards.  Each character slot moves
 * through: open -> conditional -> claimed (or contested when 2+ conditionals).
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
  members  : set User
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

fact AtMostOneConditionalPerCharacterPerParty {
  all p : Party, ch : Character |
    lone c : CharacterClaim |
      c.party = p and c.character = ch and c.claimType = Conditional
}

fact AtMostOneClaimedPerUserPerParty {
  all p : Party, u : User |
    lone c : CharacterClaim |
      c.party = p and c.owner = u and c.claimType = Claimed
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

fact UniquePreferenceRankPerUserPerParty {
  all p : Party, u : User |
    all disj c1, c2 : CharacterClaim |
      (c1.party = p and c1.owner = u and c1.claimType = Preference and
       c2.party = p and c2.owner = u and c2.claimType = Preference)
      implies c1.rank != c2.rank
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

-- 3. User claim limit: a user holds at most one claimed character per party
assert UserClaimLimit {
  all p : Party, u : User |
    #{c : CharacterClaim |
      c.party = p and c.owner = u and c.claimType = Claimed} <= 1
}

-- 4. Conditional exclusivity: at most one conditional per character per party
assert ConditionalExclusivity {
  all p : Party, ch : Character |
    #{c : CharacterClaim |
      c.party = p and c.character = ch and c.claimType = Conditional} <= 1
}

-- 5. Displacement invariant: claimed and conditional never coexist on same character
assert DisplacementInvariant {
  no p : Party, ch : Character |
    (some c1 : CharacterClaim |
      c1.party = p and c1.character = ch and c1.claimType = Claimed)
    and
    (some c2 : CharacterClaim |
      c2.party = p and c2.character = ch and c2.claimType = Conditional)
}

-- 6. Leader is always a member
assert LeaderMembership {
  all p : Party | p.leader in p.members
}

-- 7. Party size bound
assert PartySizeBound {
  all p : Party | #p.members <= 12
}

-- 8. Preference ranks are positive
assert PreferenceRanksPositive {
  all c : CharacterClaim |
    c.claimType = Preference implies c.rank >= 1
}

-- Commands

-- Show a sample valid instance with all three claim types
run ShowExample {
  #Party = 1
  #User >= 3
  #Character >= 3
  some c : CharacterClaim | c.claimType = Claimed
  some c : CharacterClaim | c.claimType = Conditional
  some c : CharacterClaim | c.claimType = Preference
} for 5 but exactly 1 Party, 4 User, 4 Character, 6 CharacterClaim, 5 Int

-- Check all assertions (5 Int = bitwidth 5, range -16..15, enough for <= 12)
check NoOrphanClaims          for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check ClaimedExclusivity      for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check UserClaimLimit          for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check ConditionalExclusivity  for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check DisplacementInvariant   for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check LeaderMembership        for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check PartySizeBound          for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
check PreferenceRanksPositive for 8 but 3 Party, 6 User, 6 Character, 10 CharacterClaim, 5 Int
