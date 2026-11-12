# Breakdown Comp

**Flatten every nested precomp in an After Effects comp into one timeline, without moving a single frame.**

When an edit is three or four precomps deep, finding out what is actually on screen means opening
comp after comp. Breakdown Comp makes a copy of the comp and explodes every precomp inside it, all
the way down, so every clip and layer sits in one flat timeline at the same place and time it
appeared in the original. That's useful for building a breakdown, handing a project off, tracking
down a source clip, or just seeing the whole edit at once.

## What it does

- Duplicates the selected comp as `<name>-breakdown`. The original is never touched.
- Explodes precomps recursively until none are left, including precomps nested inside precomps.
- Keeps each precomp layer as a hidden `[CTRL]` layer and parents its contents to it, so the
  precomp's position, scale, rotation and keyframes still apply.
- Matches timing: start offsets and time stretch carry through, and each clip is trimmed to the
  precomp layer's in and out points so the cut matches the original.
- Layers that were never visible in the original edit are kept but disabled.
- Carries over a precomp layer's disabled, audio-off and guide state to its contents.
- Ends with a report: how many precomps were exploded, which ones were left alone and why, and
  which precomp settings couldn't be carried over.
- The whole operation is one undo step.

## Install

1. Download `BreakdownComp.jsx`, or clone the repo:
   ```bash
   git clone https://github.com/RiffRaff4469/breakdown-comp.git
   ```
2. Either run it directly with **File > Scripts > Run Script File...**, or copy it into
   After Effects' `Scripts` folder and restart so it shows up under **File > Scripts**.

The script doesn't write files, so the "Allow Scripts to Write Files and Access Network" setting
isn't needed.

## Using it

1. Select a comp in the Project panel, or open it in the timeline.
2. Run **BreakdownComp.jsx**.
3. The new `<name>-breakdown` comp opens. Read the report for anything that needs a manual look.
4. Leave the `[CTRL]` layers in place. They're hidden parents; delete one and its clips jump.

## How it's built

- **A rescan loop instead of recursion.** After each explode the script scans the comp from the
  top again for the next precomp layer, until none are left (capped at 5000 explodes). Precomps
  that were inside a precomp get picked up on a later pass, so any nesting depth works.
- **Tags in layer comments.** Processed layers get `{BD:CTRL}` or `{BD:SKIP}` prepended to their
  comment, which is how the loop knows not to touch them again.
- **Order and hierarchy are rebuilt, not guessed.** Inner layers are copied with `copyToComp()`
  and moved directly above their precomp layer, which keeps their stacking order. Parenting
  inside the precomp is rebuilt by index; top-level layers are parented to the `[CTRL]` layer with
  `setParentWithJump()` so nothing shifts.
- **Timing math.** With `k` as the precomp layer's stretch, each inner layer starts at
  `precomp start + inner start * k`, and its in/out are clamped to the precomp layer's own in/out.
  Anything left with less than half a frame on screen is disabled rather than deleted.

## Limitations

- Effects, masks, opacity, blend modes and collapse transformations on a precomp layer don't carry
  over to its contents. They're listed in the report so you can reapply them.
- Precomps with time remapping or a negative (reversed) stretch are left as precomps.
- Adjustment layers, cameras and lights that were inside a precomp now affect the whole comp.
  They're listed in the report.
- Needs an After Effects version with `setParentWithJump()`. The script checks and stops with a
  message if it's missing.

Tested with After Effects 2026 (26.x) on macOS.
