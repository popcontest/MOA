# Appendix B — The title-completion system

The title is a fragment. Completing it is a gameplay surface, not decoration.

## B.1 What the sim must record

M0 must maintain a per-match log sufficient to classify how a round ended.
Minimum fields per turn: shooter, weapon, angle, power, wind at fire time,
impact distance from nearest target, damage dealt per player, deaths and their
cause (`blast`, `fall`, `crush`, `roll`, `self`, `drown` if you add water),
health before and after, and cumulative terrain volume added and removed.

Add this to the state hash. It is cheap and it means round summaries are
covered by the replay tests.

## B.2 The classifier

A pure function: `classify(matchLog) -> { headline, stamp }`. Rules are ordered
and the first match wins, so the list is a priority ordering, not a scoring
model. Keep it in `content/` as data where possible so it can be tuned without
a code change.

Headline is always "Mother of All ___". Examples of the shape:

| Condition | Headline |
|---|---|
| Killed while buried in added material | Burials |
| Won from below 10% health | Comebacks |
| Killed self with own shot | Own Goals |
| Three or more consecutive misses by the winner | Whiffs |
| Kill by roller after it travelled a long distance | Long Walks |
| Kill by fall damage from terrain collapse | Pratfalls |
| Match hit the turn limit | Stalemates |
| Winner never took damage | Beatings |
| Nothing else matched | Games |

The fallback is "Mother of All Games", which is both the graceful default and
the original tagline. That is the point.

## B.3 SOD OFF

"Sod" is turf. The burial kill, where a player dies under material added by a
dirt weapon, gets **SOD OFF** as its stamp. This is the game's signature
moment and the reason additive terrain is a Milestone 0 requirement rather
than a content-pass nicety.

The dirt weapon family is branded accordingly in `weapons.json`. Keep the
register dry: these are the only place in the UI where rudeness is allowed,
and it works because everything around it is deadpan.

Ask before writing further stamp copy. This is voice work, not code.

## B.4 Constraints

- Cards must be screenshot-friendly at portrait phone aspect. Assume people
  share them. Include the match seed in small type so a shared card is also a
  replay someone else can load.
- The classifier must be deterministic and covered by unit tests with
  hand-built match logs, not just by live play.
- No sound sting on the card. The joke is drier without one.
