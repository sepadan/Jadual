import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Newlines normalised so the assertions do not depend on the checkout's line endings.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("styles.css");
const app = read("app.js");
const html = read("index.html");

test("every pressable control answers the press", () => {
  // One rule covers every control, so a class a hand-written list would have forgotten still
  // answers the press — the previous list had already missed the builder menu and the relief tabs.
  const generic = css.match(/button:active[^{]*\{[^}]*\}/);
  assert.ok(generic, "buttons have no :active rule, so a press changes nothing");
  assert.match(generic[0], /transform/, "the pressed control does not move under the finger");
  assert.match(generic[0], /filter|opacity|background/, "the pressed control does not change colour");
  const dropzone = css.match(/\.dropzone:active[^{]*\{[^}]*\}/);
  assert.ok(dropzone, "the file drop zone is a label, so it needs its own :active rule");
  // The generic rule reaches <button> elements only, so every pressable class must be one. Cards
  // and dialogs are rendered from templates, so the markup and the renderer are both searched.
  for (const cls of ["navbtn", "relief-tab", "mini-button", "nav-item", "teacher-card-toggle"]) {
    const tag = (html + "\n" + app).match(new RegExp(`<([a-z]+)[^>]*class="[^"]*\\b${cls}\\b`));
    assert.ok(tag, `${cls} is missing from the markup`);
    assert.equal(tag[1], "button", `${cls} is not a button, so the generic press rule misses it`);
  }
  const fast = css.match(/:active[^{]*\{[^}]*transition-duration[^}]*\}/);
  assert.ok(fast, "the pressed state has no fast transition, so the response lags behind the thumb");
  assert.match(fast[0], /transition-duration:\s*\.0[0-9]s/, "the pressed transition is too slow to feel like a press");
});

test("a tap is not held back by the browser's zoom delay", () => {
  const rule = (css.match(/[^\n{}]*button[^\n{}]*\{[^}]*\}/g) || []).find((item) => /touch-action/.test(item));
  assert.ok(rule, "buttons never opt out of the double-tap delay, which is what a slow press feels like");
  assert.match(rule, /touch-action:\s*manipulation/);
  assert.match(rule, /tap-highlight-color:\s*transparent/);
});

test("the timetable tab answers before the builder loads", () => {
  const start = app.indexOf("$$('[data-schedule-mode]').forEach((button) => button.addEventListener");
  assert.ok(start > 0, "the timetable mode handler is missing from app.js");
  const body = app.slice(start, app.indexOf("\n  $$('[data-open-absence]')", start));
  const switched = body.indexOf("setScheduleMode(mode)");
  const loading = body.indexOf("await ensureBuilder()");
  assert.ok(switched >= 0 && loading >= 0 && switched < loading, "the pane still waits for the network before it changes");
  assert.match(body, /setBuilderBusy\(true/, "the pressed tab never shows that it is working");
  assert.match(body, /finally/, "the busy state is never cleared");
  assert.match(body, /builderOpening/, "a second press is not blocked while the builder opens");
});

// A disabled tab cannot keep keyboard focus, so the press would throw away the user's place.
test("the pressed tab stays focusable and cannot be opened twice", () => {
  const busy = app.slice(app.indexOf("function setBuilderBusy("), app.indexOf("function warmBuilder("));
  assert.match(busy, /aria-disabled/, "the pressed tab is not announced as unavailable");
  assert.equal(/\.disabled\s*=/.test(busy), false, "disabling the tab drops keyboard focus mid-press");
});

// The warm-up runs while the admin reads the first screen; a press during that must join it.
test("the warm-up and the press share one builder open", () => {
  assert.match(app, /let builderReadyPromise = null;/, "the builder open is not shared");
  assert.match(app, /builderReadyPromise = loadBuilder\(\)\.catch\(\(error\) => \{ builderReadyPromise = null; throw error; \}\)/, "a failed open would be cached until reload");
  assert.match(app, /if \(!admin \|\| window\.jadualBuilder \|\| builderReadyPromise\) return;/, "the warm-up starts a second open");
});

// On failure the pane the press opened stays put and explains itself.
test("a failed open keeps the pane and says how to retry", () => {
  const start = app.indexOf("$$('[data-schedule-mode]').forEach((button) => button.addEventListener");
  const handler = app.slice(start, app.indexOf("\n  $$('[data-open-absence]')", start));
  assert.match(handler, /builderNotice/, "the failure is not shown in the pane it opened");
  assert.match(handler, /cuba semula/, "the user is not told how to try again");
  assert.equal(/setScheduleMode\("relief"\)/.test(handler), false, "a failed press pulls the pane away");
});

test("the builder pane says what is happening while it loads", () => {
  assert.ok(html.includes('id="builderLoading"'), "there is no loading line inside the builder pane");
  assert.match(app, /function setBuilderBusy\(\w+, \w+ = null\)/, "the busy helper is missing");
  assert.match(app, /aria-busy/, "the pressed control is not announced as busy");
  assert.match(css, /\.schedule-switch button\.is-busy/, "the busy tab has no spinner");
});

test("the builder is warmed when the timetable screen opens, not at login", () => {
  assert.match(app, /function warmBuilder\(\)/, "there is no warm-up for the builder, so the first press pays for the whole download");
  const view = app.slice(app.indexOf("function showView("), app.indexOf("\nfunction setScheduleMode("));
  assert.match(view, /if \(name === "jadual"\) warmBuilder\(\);/, "opening the timetable screen does not warm the builder");
  const login = app.slice(app.indexOf("async function enterAdmin("), app.indexOf("\nasync function leaveAdmin"));
  assert.equal(/warmBuilder\(\)/.test(login), false, "the login path loads the builder, which the lazy-load contract forbids");
  assert.match(app, /saveData/, "the warm-up ignores a metered connection");
  assert.match(app, /effectiveType/, "iOS has no saveData flag, so the slow-network report is ignored");
  assert.match(app, /setTimeout\(start, 2500\)/, "without a timer the warm-up never runs where idle callbacks do not fire");
});

// A failed open must not leave a status line that reads like a draft is ready to edit.
test("a failed load says so instead of offering a draft", () => {
  const busy = app.slice(app.indexOf("function setBuilderBusy("), app.indexOf("function warmBuilder("));
  assert.match(busy, /builderReadyPromise \?/, "the status line cannot tell a fresh draft from a failed load");
  assert.match(busy, /Pembina tidak dimuatkan/, "a failed load still reads as a ready draft");
});
