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

## Round 2: critic

A fresh critic played two full desktop evenings with real input, a desktop walk-around, and four
phone sessions (both orientations), and measured the screenshots against the references.
13 major problems, 8 minor. What it measured:

- A whole evening now took 2 min 45 s on desktop and about 3 min 30 s on a phone, but night was
  still no harder: late catches were as quick as early ones, and sprinting at fireflies in the
  dark was the fastest way to play, against the hint on screen.
- The unlit night field had gone too far the other way: luma 5 to 7 against 18 in the night
  reference, a black void around an orange spotlight. The brief asks for a soft blue night.
- Golden-hour grass was still about twice as bright as the references (mean 129 against 64 to 90)
  with far less contrast (5th percentile 64 against 7).
- The 380 to 900 distant fireflies were effectively invisible (sub-pixel), and the opening view
  showed no catchable firefly at all.
- 2 of 51 in-reach clicks with the ring showing did nothing; misses still gave no visible feedback.
- Also major: the arm reaching for the lid read as a long flat slab across a quarter of the frame;
  the jar's inner glow read as an egg inside a cream slab; the porch could not be stepped onto;
  the end card covered the constellation on phones; a blown-out porch lamp and a bare door; no
  continuous treeline; a royal-blue zenith and no blue hour; mannequin hands.

## Round 2: fixes

- **A soft blue night.** Night ambient and moonlight raised and cooled so unlit grass sits at
  luma 16 (target 15 to 25), with a blue-violet blue hour held between sunset and night and the
  warm colour only along the horizon. Golden-hour zenith desaturated to a pale blue; rounder
  clouds lit from below.
- **Grass contrast.** Less direct sun on the field, darker roots, a yellow-green transmission tint
  only when looking into the light and an orange-gold cast when lit from the front, blades about
  a third narrower with more per tuft, longer overlaps between the distance rings. Golden-hour
  grass now measures mean 76, 5th percentile 45. Trees were added to the west so long shadows
  cross the middle of the meadow.
- **Fireflies you can see.** Every catchable firefly keeps a minimum size on screen (larger on a
  phone), yellow at the heart and yellow-green at the edge, and the nearest four light the grass
  tips under them. The distant ones are four times larger. Three catchable ones now open the
  evening 5 to 9 m in front of you.
- **A treeline.** Three unbroken bands of hedgerow and scrub beyond the fence give the fireflies a
  dark wall to show against.
- **Pacing by the clock.** Time of day now runs mainly on time (about seven minutes from golden
  hour to night if you only watch), with each catch nudging it. After dark there are fewer
  catchable fireflies and they appear farther away.
- **Night is harder, and running has a cost.** Run at a firefly in the dark and it flares, bolts
  about six metres and cannot be caught for three seconds, with a line of text saying why. On a
  phone a full push of the stick now runs, so the hint applies there too.
- **Honest ring, visible misses.** A firefly that had the ring is still caught if it drifts out
  in the instant of the click. The ring is drawn at the real size of the catch area. Any reach
  that catches nothing shows a soft ripple where the hand went and makes the nearest firefly flare.
- **The arm.** The right arm now comes up from below the frame, so only the wrist and hand show;
  the gesture is quicker.
- **The jar.** The glow volume is gone; in its place a soft edgeless haze, brighter points with
  halos (some sitting on the glass), light gathered at the rim and the thick base, and lettering
  that catches light on one side and shades on the other. Fingers in front of the glow go dark,
  with red at their edges.
- **The porch.** The steps and the porch boards are walkable, with the rail, the wall and the
  rocking chair solid. The door has panels, a knob and a screen door standing ajar; there is a
  mat and two pots of geraniums. The lamp is a small bulb; a second light with a gentle falloff
  throws a warm pool about ten metres out onto the lawn, with the posts and rails casting shadows
  across it. Window panes hold the evening sky until the lamps come on.
- **The ending.** The turn to open sky allows for the whole frame, not just its centre. Rising
  fireflies are larger and trail sparks. The constellation is drawn with lines of real width and
  is placed for the screen: above the end card on a monitor or an upright phone, beside it on a
  phone held sideways.
- Also: the sun rims the hands; you can look almost straight up; the counter waits for the title
  to fade; larger hint text on a dark plate; small lines of text mark the porch light coming on,
  the first star and full dark.

Checks after round 2: bot play-through passes; real-input test passes on desktop and phone;
1920x1080 on the RTX 4060 with GPU-synced timing is 94 to 112 fps average, worst 1% 68 to 77 fps.

## Round 3: critic

Five major problems and fifteen minor (down from 15, then 13). It caught all 20 on desktop from
the title with real input, walked up onto the porch, and played both phone sizes to the end card.

- **Major 1.** At night about 25 lights were on screen and 4 or 5 could be caught; the rest looked
  identical, many hung high in the sky or in the oak, clicking them did nothing at all, and
  nothing pointed to the next real one.
- **Major 2.** In the ending the lid arm crossed the glass as a dark red slab.
- **Major 3.** The jar was an even milky yellow (mean luma 179, darkest 5% still 121) with the
  fireflies lost in it, and it lit 3 to 4 m of grass flat mustard (58 against 3 to 14 beside the
  jars in the reference).
- **Major 4.** The white house measured 35 at dusk under a sky near 200; the porch floor, ceiling,
  door and chair were near black; every window pane showed the same gradient; from the meadow at
  night the porch wall was no brighter than the sky.
- **Major 5.** On phones an ordinary full push of the stick was a sprint, which startles fireflies
  after dark, with nothing on the stick to show where walking ends.
- Minor: grass contrast still short of the references; night sky too saturated a blue over a
  black middle distance; the sky raced to night during the ending; a tilted constellation on a
  phone held sideways; an egg-shaped moon; hedges that read as smeared texture; a jar base that
  looked like water; grass parting three metres around the player; near-white firefly cores;
  twenty identical catches; grey smudges behind the counter and hints.

## Round 3: fixes

- **Which lights are real.** The uncatchable ones are now all low over the fields beyond the
  fence or against the far trees, smaller and dimmer than catchable ones. None are overhead or in
  the oak. Catchable fireflies have a wider, softer halo.
- **Finding the next one.** After a few seconds with no catchable firefly in view, a soft glow at
  the left or right edge of the screen shows which way to turn.
- **A reach at nothing answers back.** A clearer ripple, the jar hand moves, and a line of text
  ("nothing in reach there. walk up to a light first", or, after a few tries, that the ones past
  the fence are too far).
- **The arm.** The reaching arm comes in from the right beside the jar and never crosses the
  glass; it tapers to the wrist and takes the jar's light on the side that faces it.
- **The jar.** Dark glass between bright insects: the fill is cut to a faint haze low in the jar,
  the points are larger, and the base refracts the ground instead of the sky. Its light on the
  grass is inverse-square with a radius of about a metre and a half, capped up close.
- **The farmhouse.** The tree that shaded it was moved, so the evening sun reaches the white
  siding. Daylight now bounces under the porch roof. Panes mirror the part of the sky they face.
  The lamp is a small shaded lantern; the wall beside the door is properly lit at night. The pool
  of light on the lawn is now worked out by hand from the lamp, the posts, the rail and its
  balusters, so it is bright ten metres out with real post shadows and nothing near the bulb
  burns out.
- **Sprint.** On touch only the outer rim of the stick runs, an inner ring marks where, and the
  ring and knob turn amber while running. A startled firefly now gets away fast, goes farther and
  stays uncatchable for four and a half seconds, on desktop too.
- **Variety after dark.** Some night fireflies ride high and only dip into reach now and then.
- **Night sky and moon.** Darker, less saturated zenith; a stronger moon that lights the meadow;
  a smaller moon that keeps its markings.
- **Ending.** The sky eases to night over the whole lift. Fireflies leave in a loose swirl at
  different speeds. The constellation is laid out in the camera's own frame, so it stands upright
  and centred in its space on every screen.
- **Look down.** There is a kid there now: striped T-shirt, shorts, legs and sneakers that walk.
  The grass parts around the legs only.
- Also: text shadows instead of plates behind the counter and hints; a larger "closer" label;
  hedges made of bushes rather than stretched cards; more saturated firefly colour; a tighter
  shadow frustum on phones; the share button always says what it did.

Found while testing:

- One firefly in twenty could be given a negative release time and never leave the jar, so the
  constellation had 19 stars. Fixed.
- Captures could still show a stale frame after a long burst of updates. Capture now redraws the
  current state inside an animation frame before reading the screen.
- The new lighting cost about 15% of the frame rate. The porch-light maths is now skipped away
  from the house and the seed stalks use half the triangles.

Checks after round 3: bot play-through passes; real-input test passes; 1920x1080 on the RTX 4060
with GPU-synced timing is 94 to 110 fps average, worst 1% 61 to 74 fps.
