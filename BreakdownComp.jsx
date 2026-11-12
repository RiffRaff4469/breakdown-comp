/*
    BreakdownComp.jsx  —  After Effects script
    -------------------------------------------
    Select (or open) a comp, run this script, and it will:
      1. Duplicate the comp as "<name>-breakdown" (original is never touched)
      2. Recursively explode every precomp inside it, all the way down,
         so every clip/layer sits in one flat timeline.

    How it keeps everything lined up:
      - Each precomp layer stays in the comp as a hidden "[CTRL]" layer.
      - Its inner layers are copied in directly above it and parented to it,
        so the precomp's position/scale/rotation (and keyframes) still apply.
      - Timing is offset to match, layer stretch is respected, and clips are
        trimmed to the precomp layer's in/out so the edit matches the original.

    Things that can't be carried over automatically (listed in the final report):
      - Effects, masks, opacity, blend modes, collapse transformations on precomp layers
      - Precomps with time remapping or reversed stretch (left un-exploded)
      - Adjustment layers / cameras / lights from inside precomps (now affect the whole comp)
*/

(function BreakdownComp() {
    var TAG_CTRL = "{BD:CTRL}";
    var TAG_SKIP = "{BD:SKIP}";
    var MAX_EXPLODES = 5000;

    // ---------- helpers ----------
    function getTargetComp() {
        var item = app.project.activeItem;
        if (item instanceof CompItem) return item;
        var sel = app.project.selection;
        for (var i = 0; i < sel.length; i++) {
            if (sel[i] instanceof CompItem) return sel[i];
        }
        return null;
    }

    function isTagged(layer) {
        return layer.comment && layer.comment.indexOf("{BD:") !== -1;
    }

    function tag(layer, t) {
        layer.comment = t + (layer.comment ? " " + layer.comment : "");
    }

    function isExplodable(layer) {
        return (layer instanceof AVLayer) &&
               (layer.source instanceof CompItem) &&
               !isTagged(layer);
    }

    function hasAudioSafe(layer) {
        try { return layer.hasAudio; } catch (e) { return false; }
    }

    function noteLostSettings(L, report) {
        var lost = [];
        try {
            var op = L.property("ADBE Transform Group").property("ADBE Opacity");
            if (op.numKeys > 0 || op.value < 100 || op.expressionEnabled) lost.push("opacity");
        } catch (e) {}
        try { if (L.property("ADBE Effect Parade").numProperties > 0) lost.push("effects"); } catch (e) {}
        try { if (L.property("ADBE Mask Parade").numProperties > 0) lost.push("masks"); } catch (e) {}
        try { if (L.blendingMode !== BlendingMode.NORMAL) lost.push("blend mode"); } catch (e) {}
        try { if (L.collapseTransformation) lost.push("collapse transform"); } catch (e) {}
        if (lost.length) report.lost.push(L.name + " (" + lost.join(", ") + ")");
    }

    // ---------- core: explode one precomp layer ----------
    function explode(comp, pre, report) {
        var src = pre.source;

        if (pre.timeRemapEnabled) {
            tag(pre, TAG_SKIP);
            report.skipped.push(pre.name + " (time remap)");
            return;
        }
        if (pre.stretch <= 0) {
            tag(pre, TAG_SKIP);
            report.skipped.push(pre.name + " (reversed stretch)");
            return;
        }

        noteLostSettings(pre, report);

        var k = pre.stretch / 100;
        var wasEnabled = pre.enabled;
        var wasAudio = hasAudioSafe(pre) ? pre.audioEnabled : true;
        var wasGuide = pre.guideLayer;
        var halfFrame = comp.frameDuration / 2;

        var newLayers = [];

        // Copy inner layers top -> bottom, each placed directly above the controller
        for (var i = 1; i <= src.numLayers; i++) {
            var inner = src.layer(i);
            inner.copyToComp(comp);
            var nl = comp.layer(1);
            nl.moveBefore(pre);
            newLayers[i] = nl;

            // Timing
            if (k !== 1) nl.stretch = inner.stretch * k;
            nl.startTime = pre.startTime + inner.startTime * k;

            var wantIn  = pre.startTime + inner.inPoint * k;
            var wantOut = pre.startTime + inner.outPoint * k;
            var lo = Math.max(wantIn, pre.inPoint);
            var hi = Math.min(wantOut, pre.outPoint);

            if (hi - lo > halfFrame) {
                nl.inPoint = lo;
                nl.outPoint = hi;
            } else {
                // Never visible in the original edit — keep it, but hidden and un-exploded
                nl.enabled = false;
                if (hasAudioSafe(nl)) nl.audioEnabled = false;
                tag(nl, TAG_SKIP);
                report.hidden++;
            }

            // Inherit visibility from the precomp layer
            if (!wasEnabled) nl.enabled = false;
            if (!wasAudio && hasAudioSafe(nl)) nl.audioEnabled = false;
            if (wasGuide) nl.guideLayer = true;

            if (nl.adjustmentLayer) report.adjust.push(nl.name);
            if (nl instanceof CameraLayer || nl instanceof LightLayer) report.camLight.push(nl.name);
        }

        // Rebuild parenting: inner parents stay, top-level layers follow the controller
        for (var j = 1; j <= src.numLayers; j++) {
            var innerJ = src.layer(j);
            var target = innerJ.parent ? newLayers[innerJ.parent.index] : pre;
            newLayers[j].setParentWithJump(target);
        }

        // Turn the precomp layer into a hidden controller
        pre.enabled = false;
        if (hasAudioSafe(pre)) pre.audioEnabled = false;
        pre.name = "[CTRL] " + pre.name;
        tag(pre, TAG_CTRL);
        report.exploded++;
    }

    // ---------- main ----------
    var comp = getTargetComp();
    if (!comp) {
        alert("Breakdown Comp:\nSelect a comp in the Project panel or open one in the timeline first.");
        return;
    }

    if (typeof comp.layer(1) !== "undefined" && comp.numLayers > 0 &&
        typeof comp.layer(1).setParentWithJump !== "function") {
        alert("Breakdown Comp:\nThis version of After Effects is too old (needs setParentWithJump). Please update AE.");
        return;
    }

    app.beginUndoGroup("Breakdown Comp");

    var report = { exploded: 0, hidden: 0, skipped: [], lost: [], adjust: [], camLight: [] };

    try {
        var bd = comp.duplicate();
        bd.name = comp.name + "-breakdown";

        var count = 0;
        while (count < MAX_EXPLODES) {
            var found = null;
            for (var i = 1; i <= bd.numLayers; i++) {
                if (isExplodable(bd.layer(i))) { found = bd.layer(i); break; }
            }
            if (!found) break;
            explode(bd, found, report);
            count++;
        }

        bd.openInViewer();

        var msg = "Done! Created \"" + bd.name + "\"\n\n" +
                  "Precomps exploded: " + report.exploded + "\n" +
                  "Layers in total: " + bd.numLayers + "\n";
        if (report.hidden)          msg += "Clips outside the edit (hidden): " + report.hidden + "\n";
        if (report.skipped.length)  msg += "\nLeft as precomps:\n  " + report.skipped.join("\n  ") + "\n";
        if (report.lost.length)     msg += "\nPrecomp settings not carried to children:\n  " + report.lost.join("\n  ") + "\n";
        if (report.adjust.length)   msg += "\nAdjustment layers now affect everything below:\n  " + report.adjust.join("\n  ") + "\n";
        if (report.camLight.length) msg += "\nCameras/lights from precomps (check these):\n  " + report.camLight.join("\n  ") + "\n";
        msg += "\nTip: [CTRL] layers are hidden parents — don't delete them, or the clips will jump.";
        alert(msg);
    } catch (err) {
        alert("Breakdown Comp error:\n" + err.toString() + (err.line ? "\nLine: " + err.line : ""));
    } finally {
        app.endUndoGroup();
    }
})();
