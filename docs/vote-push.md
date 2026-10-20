# Vote push kit

Where we stand (Oct 19, from `rundot jam promo`): **rank #77, 9 votes, 55 plays, 663 entries**. Voting closes **Nov 6, 12:00 PM Pacific (11 PM in Uganda)**. Entries themselves close Nov 2. Every number below the rules is a target, not a promise.

## How voting actually works (verified Oct 19)

- The deep link **scrolls straight to our card** and highlights it in cyan — no searching. The Vote button sits right on the card.
- If the player is signed out, pressing Vote opens a sign-in popup (Continue with Google). After signing in they come back to where they were and press Vote again.
- Unless signed in first, some players got dumped at the top of the jam list: 663 entries in randomized order and they gave up there. **So tell people to sign in first, then vote.**
- Each account gets **10 votes per day** (resets daily). One vote per game. Voters can come back any day until Nov 6 — but ask for it once, early.

## Links

- **Vote page (send this one):** https://run.world/jams/octoberjam?game=Zo8tRIGBpGhAGb0XCXoI
- **Play the game:** https://w.run/cobaltphoenix373/tag-team-terror
- Fresh links, rank and counts any time: `rundot jam promo` in the project folder.

## The rules (break one and the entry is disqualified)

- One vote per person, from their own RUN account. Never ask anyone to make extra accounts.
- No vote trading ("I vote yours, you vote mine"), even with other jam entrants.
- No rewards for voting: no airtime, no money, no favours, no giveaways tied to votes.
- Ask for an honest vote after they play. "Play it, and vote if you liked it" is fine.

## How a friend votes (paste these steps whenever they ask)

1. Open the vote link below.
2. Sign in to RUN first (top banner "Sign in to save your progress" — free, one minute, Google works).
3. Now press **Vote** on our card — it's already scrolled into view and glowing cyan. One vote, it can't be repeated.
4. likes elsewhere on RUN don't count, only this button.
   https://run.world/jams/octoberjam?game=Zo8tRIGBpGhAGb0XCXoI

## Ready-to-paste posts

**WhatsApp (friends, family, class and campus groups)**

> I made a game! Tag Team Terror is a monster brawler where you swap between a werewolf, a vampire and a patchwork giant mid-fight. It's in the RUN October Jam and I need votes to place.
>
> Voting is 30 seconds: open the link, sign in to RUN (Google, takes a minute), then press Vote on the glowing card — the page opens right on our game, no scrolling. Play it on your phone first if you like!
>
> https://run.world/jams/octoberjam?game=Zo8tRIGBpGhAGb0XCXoI

**WhatsApp status / Instagram story** (with a screenshot or the trailer)

> My game is in a global game jam. Open the link, sign in, press Vote on the glowing card. Werewolf, vampire, and a giant who smashes the ground.
> https://run.world/jams/octoberjam?game=Zo8tRIGBpGhAGb0XCXoI

**X / Twitter**

> Built Tag Team Terror for the RUN October Jam: swap between a werewolf, a vampire and a patchwork giant, dodge crossbow bolts, counter purple attacks, transform for 10 seconds. Playable on your phone. To vote: open the link, sign in, press Vote on the highlighted card. https://run.world/jams/octoberjam?game=Zo8tRIGBpGhAGb0XCXoI

**RUN Discord (jam channel)**

> Hi all, Tag Team Terror is my entry: a 3D tag-team monster brawler (perfect dodges slow time, purple attacks can be countered, each monster transforms). Would love feedback on the combat feel, and a vote if you enjoy it — the link opens right on our card, just sign in first: https://run.world/jams/octoberjam?game=Zo8tRIGBpGhAGb0XCXoI

**Follow-up a few days later (to people who already played)**

> Thanks for playing! New this week: [one new thing, e.g. sound and music]. If you haven't voted yet, it still counts until Nov 6: open the link, sign in, press Vote on the glowing card. https://run.world/jams/octoberjam?game=Zo8tRIGBpGhAGb0XCXoI

## Schedule

| When | Who | What |
| --- | --- | --- |
| Today | Owner | WhatsApp: 10 to 20 people you know personally, one by one (personal messages convert far better than group posts) |
| Today | Owner | Post in 2 or 3 class or campus groups and your status |
| Oct 19 | Owner | X post and the RUN Discord jam channel |
| Every 3 to 4 days | Owner | A short clip of a new feature (trailer, boss, transformations) with the vote link |
| Each update | Claude | Note the change in the game's changelog so returning players see something new |
| Nov 4 to 6 | Owner | Last call: "voting closes Nov 6" to everyone who played but has not voted |

## Inside the game (built from v1.14.0)

- End screen has a big **"VOTE FOR US"** button that auto-opens the jam page on every device: a new tab on plain browsers, takeover of the RUN host page inside the embed, a host-invoked CTA escape hatch (`playable.cta`) when the embed is sandboxed, the native share sheet with the vote link as a phone backup, and copying the link only if all of those fail. Below it a one-line explainer: "opens with our card already highlighted; sign in first, then press Vote."
- A **Share with a friend** button stays under it (tracked play link via the RUN share sheet).
- The settings gear → pause panel has sound/shake/flash and Resume/Menu.

## Track it

Run `rundot jam promo` every couple of days and log the numbers here.

| Date | Rank | Votes | Plays |
| --- | --- | --- | --- |
| Oct 18 | #190 | 3 | 30 |
| Oct 19 | #77 | 9 | 55 |
