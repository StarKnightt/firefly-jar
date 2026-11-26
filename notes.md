# Firefly Jar: build notes

A log of how the game was built and what each review round found and changed.

## How quality was checked

- **Builder** builds or fixes, then stops.
- **Critic**: a fresh agent each round that has never seen the code. It plays the game through a
  real browser with real keyboard, mouse and touch input at desktop (1920x1080) and phone
  (844x390 and 390x844) sizes, looks at a standard screenshot set from a full play-through, and
  compares those screenshots side by side with the real photographs in `refs/` (fireflies at dusk,
  a glowing jar at night, backlit golden-hour grass, a farmhouse porch light). It is not allowed
  to say anything looks good; it only lists what looks cheap, confusing or not fun.
- Builder fixes the biggest problems first. Five rounds at most, then ship.

Every automated run uses headless Chrome on the RTX 4060 and asserts the GPU renderer string
before doing anything (`tools/lib/browser.mjs`); a software rasteriser fails the run.

## Round 0: first playable (builder)

Built from an empty folder:

- three.js r187 on the WebGPU renderer with TSL materials, WebGL2 fallback for phones without WebGPU.
- Time of day as one number, 0 (golden hour) to 1 (night): sun, sky, haze, light and exposure are
  keyed to it. It follows the jar (each catch brings night closer) and the clock.
- Sky dome, haze that matches the horizon, cirrus, stars, moon: all TSL.
- Grass: three rings of instanced tufts that wrap around the camera, placed in the vertex shader;
  wind gusts, blades that part around the player, backlight through the blades. Four kinds of
  wildflower in drifts.
- Oak (EZ-Tree growth), tire swing (Poly Haven tyre), weathered fence and gate, clapboard
  farmhouse with porch, lit windows and porch light, treeline, power line, a town on the horizon.
- First-person hands (WebXR generic hand models, fingers posed with forward kinematics) around a
  lathe-turned mason jar with a punched zinc lid.
- Fireflies: wander, J-shaped flash, catch swoop into the jar; jar light spills on hands and grass.
- Ending: jar lifts, lid comes off, twenty fireflies rise and settle as stars.
- Controls: WASD + pointer-lock mouse, or floating thumbstick + drag-look + tap on touch.
- Sound: real cricket and breeze recordings (CC0), a synthesized music box that adds layers as
  the jar fills, a bell per catch.

Checks at the end of round 0:

- Bot play-through (deterministic time): 20 caught, 20 released, end card reached.
- Real input test: desktop walk, strafe, mouse look, pointer lock, click-catch; phone thumbstick,
  drag-look while walking, tap-catch. All pass.
- 1920x1080 on the RTX 4060, GPU-synced timing (waits for the GPU queue every frame): about
  142 fps average, worst 1% above 60 fps, 7.4M triangles.
