# Print D&D

The site for **printdnd.ca**. Print D&D puts a BracketBot next to a 3D printer so that
when a job finishes the robot lifts the bed, takes the part out and sets the machine up
for the next print. **D&D is Do Not Disturb** — the printer keeps going, nobody has to be
in the room.

Static single page. Vite + vanilla TypeScript + Three.js, no UI framework.

```
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit && vite build  ->  dist/
npm run preview   # serve the production build
```

Node 22+ (see `.nvmrc`).

## Before it goes live

Two things are deliberately left unfinished, and both are visible in the page so they
can't be shipped by accident:

- **Contact address** — `index.html` renders `TODO — add contact email`. Replace the text
  and the `href="#"` with a real `mailto:`.
- **Team roles** — the four names render without titles. There's a comment above the
  block if you want to add a role line per person, or photos.

## The robot is replaying real data

The 3D model is not animated by hand. `public/data/episode.json` is baked from
**ep000000** of the team's own `quest_teleop / "lift up the printer bed"` dataset — a
12.0s take where both arms tracked throughout, both grippers closed 0 → 1, and the end
effector travelled about 20cm. Scrolling scrubs through it. Arm joint angles, gripper
state and body lean are all recorded values.

Two display gains are applied in `src/three/playback.ts`, and they are the only liberties
taken. `JOINT_GAIN` scales the recorded joint deltas (which span 1–12°, close to
invisible at the size the robot renders) and `BODY_GAIN` damps the IMU trace (played 1:1
the robot appears to topple). Both scale the real signal; neither invents one.

The clip in *What it sees* is the left wrist camera from the **same** episode, so the
model and the footage are two views of one recording.

### Re-baking the data

Both scripts read from the dataset in `~/Downloads/bracketbot/` by default and write
committed artefacts into `public/`. You only need them if you want to swap in a different
episode.

```
npm run bake:episode    # .npz  -> public/data/episode.json      (~55KB)
npm run bake:clip       # .mkv  -> public/media/wrist-cam.mp4    (~1MB, needs ffmpeg)
```

Pass a path as the first argument to use a different recording. Note that the head-camera
recording for ep000000 is truncated (87 of 355 frames decode) — that's why the wrist
camera is used instead.

## Two rules the site is built on

**1. Nothing is claimed that can't be backed up.** No customers, pricing, uptime figures,
print counts, funding, partners or launch dates. Every spec in *The machine* is visible in
a photograph of the actual robot or is a channel in the team's own recordings:

| Claim | Evidence |
|---|---|
| Stereo camera head | in the photo; `video_head_*` in the dataset |
| 2 arms × 8 actuated joints | `arm_left_state.pos` / `arm_right_state.pos` are 8-wide |
| Parallel-jaw grippers | in the photo; the `grip` channel runs 0 → 1 |
| Wrist + arm cameras | in the photo; `video_arm_left` / `video_arm_right` |
| 2 drive motors, IMU-stabilised | `drive_state` has exactly 2 motors; `imu_orientation` |
| Demonstrations by VR teleop | the dataset path is `quest_teleop` |
| Bambu Lab X1 Carbon | legible on the printer in the footage |

Do **not** reuse the 4040-extrusion / hoverboard-wheel / 10S2P-battery specs from older
public BracketBot write-ups. Those describe a different, earlier machine and putting them
here would be fabrication.

The *Why it matters* section is split into "Running today" and "Where it goes" on purpose,
so ambition can't be misread as a shipped product. Move items left as they land.

**2. It must not read as generated.** No violet→blue gradients, no glassmorphism, no
three-column icon-card grids, no emoji, no Lucide/Feather icons, and none of
revolutionize / unlock / seamless / empower / elevate / "the future of". Sections
deliberately differ in column span and vertical rhythm so no two read the same.

## Layout of the code

```
index.html              all copy, semantic sections
scripts/
  bake-episode.py       npz -> episode.json
  bake-clip.sh          mkv -> wrist-cam.mp4 + poster
src/
  main.ts               smooth scroll, reveals, scroll -> episode progress
  styles/               tokens, base, layout, sections
  three/
    scene.ts            renderer, lights, environment, bloom, frame loop
    bracketbot.ts       the model
    materials.ts        printed plastic with world-space layer lines
    playback.ts         episode -> rig
```

`src/three/materials.ts` computes the FDM layer banding from world-space height in the
shader rather than from a texture, so the layer pitch stays constant across every part
regardless of how each piece was built or scaled.

### Behaviour worth knowing

- `prefers-reduced-motion: reduce` → one static pose, no frame loop, no scroll scrubbing,
  and the clip stays on its poster with controls exposed.
- The frame loop pauses when the canvas scrolls out of view or the tab is hidden.
- Under 860px the robot moves behind the text at low opacity, bloom is off and segment
  counts drop.
- No WebGL → the canvas is hidden and a still frame shows instead.
- The canvas clears transparent and its edges are feathered in CSS. An opaque clear set to
  the page colour does **not** work: it passes through ACES tone mapping and comes out
  lighter, painting a visible grey rectangle down the page.

## Deploying to Vercel

1. Push to GitHub, then **Add New → Project** in Vercel and import the repo.
2. Framework preset **Vite** — `vercel.json` already sets the build command, output
   directory and cache headers.
3. **Settings → Domains**, add `printdnd.ca` and `www.printdnd.ca`.
4. At whoever registers the `.ca`, set:

   | Type | Name | Value |
   |---|---|---|
   | `A` | `@` | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |

   Vercel shows the exact values for your project under Domains — use those if they
   differ. TLS is issued automatically once DNS resolves.

## If you ever want to use Spline instead

Spline has no API or CLI — a `.splinecode` file is a proprietary export produced by a
human in the spline.design editor, which is why the robot here is hand-coded Three.js
instead. If someone does model it in Spline, the swap point is marked at the top of
`src/three/scene.ts`: keep `mountRobot`'s signature (`setProgress`, `onFrame`, `dispose`)
and the page needs no other changes.
