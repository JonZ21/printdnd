# PrintDND

Marketing site for PrintDND — printdnd.ca. Static single page: Vite + vanilla TypeScript
+ Three.js. Deployed on Vercel.

**Note:** the inherited `~/AGENTS.md` describes Homebrew/brew and does not apply here.
Ignore it in this repo. There is no `./bin/brew`.

## Commands

```
npm run dev           # local dev server
npm run build         # tsc --noEmit && vite build
npm run preview       # serve the production build
npm run bake:episode  # teleop .npz  -> public/data/episode.json
npm run bake:clip     # raw footage  -> public/media/*.mp4 + posters (needs ffmpeg)
```

Raw footage dropped in the repo root is gitignored; only the encoded output under
`public/media/` is committed.

## What the project actually is

A robot that autonomously clears a 3D printer from its previous job and places the print
where you want it, so printing continues while you're on Do Not Disturb. Built at **Hack
the North** on a **BracketBot** (a sponsor's robot), not on hardware the team built.

Facts that are true and may be stated:

| Claim | Source |
|---|---|
| Bimanual, 7-DOF per arm, two-wheel base, RL balance | BracketBot platform |
| Teleoperated with a Meta Quest 3S | the team's own workflow |
| 100+ episodes collected, stored in BracketBot's cloud | the team's own logs |
| Fine-tuned Physical Intelligence **PI0.5** VLA | the team's own training |
| Inference on Montreal servers | the team's own deployment |
| "Hey BracketBot" wake word, responds and acts | the team's own feature |
| Bambu Lab X1 Carbon | legible on the printer in the footage |
| Grippers top out ~2kg; a printed jig flexes the plate instead | the team's own writeup |
| The printer occludes the head camera, so the policy leans on the wrist cameras | ditto |
| ~75% of recorded data lost to the `/pending` cap silently overwriting | ditto |

Do **not** reuse the 4040-extrusion / hoverboard-wheel / 10S2P-battery specs from older
public BracketBot write-ups — those describe a different, earlier machine.

## Two rules that matter more than the code

1. **Don't invent facts.** Every claim must trace to the footage, the team's own logs, or
   their writeup. No customers, pricing, uptime figures, print counts, funding, partners
   or launch dates. Anything a human must supply is a visible `TODO`, never a
   plausible-sounding guess.

2. **It must not read as generated.** No violet→blue gradients, no glassmorphism, no
   three-column icon-card grids, no emoji, no Lucide/Feather icons, no "revolutionize /
   unlock / seamless / empower / elevate / the future of". Sections deliberately differ in
   rhythm and column span.

## The page

Hero (the autonomous run, portrait) → clip strip → **01** what it does → **02** how we
built it (+ the 3D robot) → **03** what broke → **04** robots build robots → **05** what's
next. No team or contact section.

## The 3D robot

`src/three/` renders the robot from primitives and replays a **real** teleop episode
(`public/data/episode.json`, baked from `ep000000` of the `lift_up_the_printer_bed`
dataset). Arm joints, gripper state and body lean are all recorded values — not authored
keyframes. Two display gains in `playback.ts` scale that real signal so it reads on
screen; neither invents one. Keep it that way.

It lives alongside **02 how we built it**. Its opacity is driven by how much of that
section the viewport is showing, not by scroll offsets — offsets let it bleed into the
hero whenever the viewport is taller than the hero, which is normal on a phone.

`src/three/scene.ts` has a documented swap point if a Spline scene ever replaces this.
Spline can't be scripted: `.splinecode` is a proprietary export made by hand in their GUI.

## Deploying

Vercel, framework preset Vite; `vercel.json` sets build command, output dir and cache
headers. For `printdnd.ca`: apex `A` → `76.76.21.21`, `www` `CNAME` →
`cname.vercel-dns.com` (use whatever Vercel shows under Domains if it differs).
