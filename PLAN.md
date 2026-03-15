# Nijigasaki Tokuten Card Matching Tool — Implementation Plan

## Product Summary

A mobile-first web app that helps fans of Love Live! Nijigasaki High School Idol Club form parties of up to 12 people to split-buy a limited tokuten (bonus) set containing 12 tickets, 12 character cards, and a 三つ折りボード (tri-fold board). The set costs ¥21,600 (tax included). Pre-order opens **May 15, 2026**.

The tool tracks preferences, records claims, shows cost splits, and helps party leaders manage their groups — but does **not** enforce commitments or handle payments.

## The 12 Nijigasaki Members

1. 上原歩夢 (Ayumu Uehara)
2. 中須かすみ (Kasumi Nakasu)
3. 桜坂しずく (Shizuku Osaka)
4. 朝香果林 (Karin Asaka)
5. 宮下愛 (Ai Miyashita)
6. 近江彼方 (Kanata Konoe)
7. 優木せつ菜 (Setsuna Yuki)
8. エマ・ヴェルデ (Emma Verde)
9. 天王寺璃奈 (Rina Tennoji)
10. 三船栞子 (Shioriko Mifune)
11. ミア・テイラー (Mia Taylor)
12. 鐘嵐珠 (Lanzhu Zhong)

## Core Data Model

### User
- id, display_name, avatar_url
- oauth_provider, oauth_id
- languages: string[] (ja, en, zh)
- payment_methods: string[] (PayPay, PayPal, Venmo, Wish, etc.)
- created_at

### Party
- id, name, description
- leader_id → User
- status: open | locked
- group_chat_link: string (optional, LINE/Discord/etc.)
- language: string (primary language)
- created_at
- auto_promote_date: date (default: May 8, 2026)

### PartyMember
- party_id → Party
- user_id → User
- joined_at

### CharacterClaim
- party_id → Party
- character_id: 1-12
- user_id → User
- claim_type: preference | conditional | claimed
- rank: number (for preferences, 1 = most wanted)
- created_at

### Key Rules
- One **claimed** per character per party (enforced)
- One **conditional** per character per party (enforced)
- Multiple **preferences** per character per party (anyone can want anyone)
- A user can claim at most 1 character per party as "claimed"
- A user can have multiple conditional claims in one party
- A user can be in multiple parties

## Claim State Machine (per character, per party)

```
                        ┌─────────────┐
        preferences     │    OPEN     │  no claims yet
        visible here    │  (wanted:3) │
                        └──────┬──────┘
                               │ someone conditionally claims
                               ▼
                        ┌──────────────┐
                        │ CONDITIONAL  │  "I'll take her if
                        │  (@user)     │   no one else does"
                        └──────┬──────┘
                          │         │
            someone else  │         │ auto-promote on deadline
            full-claims   │         │ or leader promotes
                          ▼         ▼
                        ┌──────────────┐
                        │   CLAIMED    │  settled
                        │  (@user)     │
                        └──────────────┘

  If 2+ people conditional-claim → CONTESTED (needs discussion)
  If someone full-claims over a conditional → conditional displaced (notified)
```

## Pages / Routes

### 1. Landing / Home
- Brief explanation + risk reminder
- "Find a Party" / "Create a Party" CTAs
- Language selector (ja/en/zh)

### 2. OAuth Sign Up / Login
- Google / Discord / LINE OAuth
- After first login: set display name, languages, payment methods

### 3. Party Listing (Browse)
- Filterable by: language, payment method, open character slots
- Each card shows: party name, member count, open/contested characters, days until May 15
- "Show parties that need [character]" quick filter

### 4. Party Detail
- Character grid (12 characters): showing state (open/wanted/conditional/claimed/contested)
- Member list with their claims
- Cost split display:
  ```
  ¥21,600 ÷ [members with claims] = ¥X/person
  ボード: decided by party
  ```
- Join button (if not member)
- Group chat link (if member)
- Countdown to May 15

### 5. Party Dashboard (Leader View, extends Party Detail)
- Readiness check button → pings all members
- Multi-party warnings ("@user is in 2 other parties")
- Contested character alerts
- Party lock toggle
- Auto-promote date setting
- Milestone reminder settings (30d, 14d, 3d, day-of)

### 6. My Parties (User Dashboard)
- List of all parties user is in
- Per-party: their claim status, party fill status, countdown

### 7. User Profile
- Display name, languages, payment methods
- Edit profile

## Risk Reminder Text (shown on sign-up and party join)

> **Important Notice / ご注意 / 注意事项**
>
> This tool helps you find and coordinate with other fans to split-purchase
> a tokuten set. It does NOT process payments, guarantee fulfillment, or
> mediate disputes.
>
> - Coordinate payment and shipping directly with your party members.
> - Only transact with people you trust. Verify identities through your
>   group chat before sending money.
> - This tool cannot enforce commitments. Members may leave at any time.
> - The tokuten set is limited in supply. Forming a party does not
>   guarantee availability on May 15.
>
> By using this tool, you acknowledge these risks and agree to resolve any
> disputes among your party members directly.

## Tech Stack

- **Framework**: React Router v7 (successor to Remix, runs natively on Cloudflare Pages Functions)
- **Language**: TypeScript
- **Database**: Cloudflare D1 (SQLite-based, serverless) via Drizzle ORM
- **Auth**: Custom OAuth flow on Workers (Google + Discord providers)
- **Styling**: Tailwind CSS (mobile-first)
- **Deployment**: Cloudflare Pages (single deploy: static assets + Pages Functions for SSR/API)
- **Sessions**: Cloudflare KV for session storage
- **i18n**: react-router-i18next or i18next (ja/en/zh)

## Implementation Phases

### Phase 1: Foundation
1. Initialize React Router v7 project with TypeScript + Tailwind + Cloudflare Pages template
2. Set up Drizzle ORM schema with Cloudflare D1
3. Implement OAuth flow (Google + Discord) with KV session storage
4. Set up i18next with ja/en/zh
5. Create base layout (mobile-first, responsive)

### Phase 2: Core Features
6. Implement User profile (languages, payment methods)
7. Create Party CRUD (create, list, detail)
8. Build character grid component with claim states
9. Implement claim logic (preference/conditional/claimed)
10. Build party listing with filters

### Phase 3: Leader Tools
11. Leader dashboard with member overview
12. Multi-party transparency indicators
13. Contested character detection + alerts
14. Party lock mechanism
15. Readiness check (in-app notification)

### Phase 4: Polish
16. Cost split display
17. Countdown timer to May 15
18. Risk reminder modal
19. Milestone reminders (could be email or in-app)
20. Mobile UX polish

## Discord Bot Idea (future, not MVP)

A Discord bot could:
- Post a party's character grid as an embed in a Discord channel
- Let users `/claim Ayumu` directly in Discord, synced back to the web app
- Send reminder pings to the channel as May 15 approaches
- This turns the Discord group chat into a first-class interface, reducing the need to switch between Discord and the web app

This is a strong post-MVP feature since many fans already organize in Discord.
