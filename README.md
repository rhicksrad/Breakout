# Neon Breakout

A dependency-free breakout game in a single JavaScript file. No build step and
no frameworks — open `index.html` and play, or serve the folder statically
(GitHub Pages works as-is). Ships with CC0 sprite art, seamless nebula
backdrops, and a looping synth soundtrack; if any asset fails to load the
renderer falls back to its built-in vector art, so the game always runs.

## Controls

| Input | Action |
|---|---|
| Mouse / touch / `←` `→` / `A` `D` | Move paddle |
| Click / `Space` | Launch ball, fire lasers |
| `P` / `Esc` | Pause |
| `M` | Mute |
| `R` | Restart (from pause / game over) |

## Asset credits (all CC0 / public domain)

- **Sprites** (bricks, paddle, ball, capsules, heart, star) —
  [Breakout Tile Set](https://opengameart.org/content/breakout-brick-breaker-tile-set-free)
  by imaginelabs.rocks
- **Nebula backgrounds** —
  [Seamless Space Backgrounds](https://opengameart.org/content/seamless-space-backgrounds)
  by Screaming Brain Studios
- **Music** — [Space Ranger (seamless loop)](https://opengameart.org/content/music-loop-strong-downtempo-seamless)
  from OpenGameArt
- **Font** — [Orbitron](https://fonts.google.com/specimen/Orbitron) by Matt
  McInerney (SIL OFL 1.1)

Sound *effects* remain 100% procedural WebAudio — no sample files.

## Engine notes

- **Fixed-timestep simulation (120 Hz)** decoupled from render, so physics is
  identical at any frame rate.
- **Swept circle-vs-AABB collision** — each ball's movement is raycast against
  the Minkowski-expanded bricks, paddle, and walls, and resolved at the exact
  time of impact. Balls cannot tunnel at any speed.
- **Paddle english** — exit angle is derived from the impact point across the
  paddle face, seasoned with the paddle's own velocity. Aim is a skill.
- **Procedural audio** — every sound effect is synthesized with WebAudio
  oscillators and filtered noise at play time; brick pitch climbs a semitone
  per combo. Music is a seamless CC0 loop that starts on first input.
- **Pooled particles** — sparks, rotating brick shards with gravity, and
  shockwave rings share one fixed-size pool. Plus screen shake, hit-stop, and
  ball trails.
- **Levels** — 8 designed boards (steel, explosive, and indestructible brick
  types), then endless mirrored procedural sectors that ramp in density.
- **Combo scoring** — bricks broken without touching the paddle multiply score
  up to and beyond 5×; best score persists in `localStorage`.

## Brick types

| Brick | Behavior |
|---|---|
| Colored tiers | 1 hit, 50–110 pts |
| Steel | 3 hits, shows cracks |
| Explosive | Chain-reacts in a radius |
| Dark solid | Indestructible; doesn't block level clear |

## Power-ups

`E` wide paddle · `M` multiball · `L` lasers · `S` slow-mo · `C` catch ·
`F` fireball (pierces bricks) · `+` extra life
