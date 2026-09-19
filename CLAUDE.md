# Print D&D

Marketing site for Print D&D — printdnd.ca. Static single page: Vite + vanilla TypeScript
+ Three.js. Deployed on Vercel.

**Note:** the inherited `~/AGENTS.md` describes Homebrew/brew and does not apply here.
Ignore it in this repo. There is no `./bin/brew`.

## Commands

```
npm run dev      # local dev server
npm run build    # tsc --noEmit && vite build
npm run preview  # serve the production build
```

## Two rules that matter more than the code

1. **Don't invent facts.** Every claim on this page must be backed by the photo of the
   robot or by the team's own recorded data. No customers, pricing, uptime figures, print
   counts, funding, partners or launch dates. Anything a human must supply is a visible
   `TODO`, never a plausible-sounding guess. In particular, do *not* reuse the
   4040-extrusion / hoverboard-wheel / 10S2P-battery specs from older public BracketBot
   write-ups — those describe a different, earlier machine.

2. **It must not read as generated.** No violet→blue gradients, no glassmorphism, no
   three-column icon-card grids, no emoji, no Lucide/Feather icons, no "revolutionize /
   unlock / seamless / empower / elevate / the future of". Sections deliberately differ in
   rhythm and column span.

## The 3D robot

`src/three/` renders the robot from primitives and replays a **real** teleop episode
(`public/data/episode.json`, baked from `ep000000` of the team's
`lift_up_the_printer_bed` dataset). Arm joints, gripper state and body lean are all
recorded values — not authored keyframes. Keep it that way.

`src/three/scene.ts` has a documented swap point if a Spline scene ever replaces this.
