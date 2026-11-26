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

## Reference photographs

Added at the user's request before round 1: 25 real photographs, all public domain or licensed
for reuse, kept in `refs/` (not committed). The critic compares against them every round.

| Subject | Photos used (author, licence) |
| --- | --- |
| Fireflies in a meadow at dusk | Tyler Savitski (CC BY-SA 4.0), Mike Lewinski (CC BY 2.0), stevekl0 (CC BY 2.0), davedehetre (CC BY 2.0), Genista (CC BY-SA 2.0), qmnonic (CC BY 2.0), Ashley Harrigan (CC BY 2.0) |
| A glowing jar at night | AngryJulieMonday (CC BY 2.0), Eric Kilby (CC BY-SA 2.0), TarahDawdy (CC BY 2.0), Backyard Boss (CC BY 2.0) |
| Golden-hour grass with backlight | sagesolar (CC BY 2.0), rkramer62 (CC BY 2.0), Infomastern (CC BY-SA 2.0), mpardo.photo (CC0), kewl (CC BY 2.0, two photos), Christoph Wurst (CC BY-SA 3.0), Cristian Ştefănescu (CC BY 2.0) |
| A farmhouse porch light at dusk | somegeekintn (CC BY 2.0), poweron (CC BY 2.0), Image Catalog (CC0), Nicholas_T (CC BY 2.0), ShebleyCL (CC BY 2.0), benjaflynn (CC BY 2.0) |

One gap: no reuse-licensed photograph of live fireflies glowing inside a jar at night turned up on
Openverse or Wikimedia Commons. That subject is covered by the nearest real evidence instead: a
glowing jar held in two hands in the dark (a glow-stick lantern), real mason-jar glass in warm
light, and lit jars standing in grass at night.

## Round 1: critic

Played three full evenings on desktop with real keyboard and mouse, one on phone landscape and one
on phone portrait with real multi-touch, and compared against all four reference sets.
15 major problems, 11 minor. The measurements that mattered:

- Night ground was 3 to 10 times brighter than any night reference (average luma 54 to 82 against
  4 to 23), and the night sky twice as bright and eight times as saturated.
- The jar was dimmer than the farmhouse windows; its light was a flat lime disc about 5 m wide.
- 8 to 28 fireflies in a 66 m meadow, one to seven on screen, white blobs rather than
  yellow-green points; none visible in the dusk screenshot.
- Golden-hour grass had half the contrast of the reference and no backlit blades.
- A whole evening took 81 to 88 seconds. Golden hour was over by the fifth catch.
- Night was not harder: 4 to 5 seconds per catch at any time of evening.
- A miss or a too-far click gave no feedback; the lid popped open on any click.
- The open gate was an invisible wall 17 m from the porch.
- Also major: flat farmhouse windows and a bloom ball for a porch lamp, mannequin hands, a
  plastic-looking jar whose lid floated by itself, paper-star daisies, a magenta dusk and a
  searchlight band at night, an ending that did not land, and a crowded phone portrait layout.

## Round 1: fixes

Everything major was addressed.

- **Darkness.** Night ambient cut to about a quarter, moonlight halved, exposure lowered, night sky
  taken down to near-black navy. The jar, the porch and the windows are now the lights.
- **The jar is a lantern.** A soft glowing volume inside the glass, glass that gathers light at its
  thick base and rim, raised "MASON" lettering, an inner wall for thickness. Skin facing the jar
  lights up warm and the edges of fingers glow red. On the grass the light falls off within about
  2.5 m and blades standing between you and the jar stay dark.
- **Lid and hands.** Two-piece zinc lid with rolled threads and nail holes. The right hand now
  leaves the side of the jar, lifts the lid for each catch and puts it back; in the ending it
  unscrews the lid and carries it away. Shorter fingers, fingernails, a lower grip that leaves the
  glass face clear. The lid no longer moves on a miss.
- **Fireflies.** Chartreuse instead of white, capped in size up close, on for half a second with
  a rising J-shaped swoop, properly dark between flashes at night. 380 to 900 more that cannot be
  caught: low over the fields past the fence, high over the meadow, and around the oak's crown.
  Nothing uncatchable is ever at catching height inside the fence.
- **Grass.** Stronger backlight through blades when looking toward the sun, darker roots, clumps
  of very different heights, rust and straw patches, seed stalks with plumes, finer and denser
  blades underfoot. The shadow map now reaches the treeline, so long tree shadows cross the meadow.
  The sun sits on the horizon in an orange-to-blue sky.
- **Pacing.** Fewer catchable fireflies (5 at golden hour, 13 at night), each spawned a walk away
  and well apart. Time of day follows a curve that holds golden hour for the first five catches.
  A perfect-aim bot now needs 108 to 112 seconds where it needed 30; a person takes several
  minutes.
- **Feedback and difficulty.** The crosshair ring appears only when a click will catch; aimed but
  too far shows a different mark and the word "closer", plus a line of text. A miss makes the
  nearest firefly flare and dart away. After dark they slip away from a running child but let a
  walking one come close, the reach is shorter and the aim tighter.
- **The gate.** You can walk through it and up the path to the foot of the porch steps.
- **Farmhouse.** Dimmer, varied windows (drawn curtains, a television), a small lamp instead of a
  bloom ball, and a shadow-casting porch light so posts and rails throw shadows across the lawn.
- **Sky.** Muted dusk with the warm colour kept to a thin band, a narrow grainy Milky Way instead
  of a pale beam, several times more stars, a moon with maria and a tight halo.
- **Ending.** The hand opens the jar; they leave over eight seconds, turn around you, and climb to
  a patch of sky chosen to be clear of the oak, the roof and the moon, where they settle as a
  jar-shaped constellation joined by faint lines. The hands sink out of frame.
- **Phone portrait and UI.** Smaller, lower jar and arms; the thumbstick is drawn only under a
  thumb (after a short hint); a dark plate behind the counter; hints moved to a clear band under
  the counter; larger instruction text; Shift to run is mentioned; any click resumes from pause;
  a firefly behind the mute button can be tapped; restarting dips through dark.
- Also: smaller round-petalled flowers that go dark at night, unlit town and power-line
  silhouettes, trees in loose groves of mixed sizes, thicker swing rope hung farther from the
  trunk, buttress roots on the oak.

Found while testing the fixes:

- Screenshots taken straight after a burst of frames could show a frame from a second earlier,
  because the GPU had not drained its queue. Every capture tool (and the trailer) now waits for
  `queue.onSubmittedWorkDone()` first.
- Pressing a key immediately after "begin" could be swallowed by a one-second stall while
  pipelines compiled. Compilation and five warm-up frames now happen behind the loading state.

Checks after round 1: bot play-through passes (20 caught, 20 released, end card); real-input test
passes on desktop and phone; 1920x1080 on the RTX 4060 with GPU-synced timing is 108 to 117 fps
average, worst 1% 68 to 78 fps.
