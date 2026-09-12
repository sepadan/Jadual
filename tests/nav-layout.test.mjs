import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Newlines normalised so the assertions do not depend on the checkout's line endings.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const css = read("styles.css");
const app = read("app.js");

function navBlock(markup, marker) {
  const start = markup.indexOf(marker);
  assert.ok(start >= 0, `${marker} is missing from index.html`);
  const end = markup.indexOf("</nav>", start);
  assert.ok(end > start, `${marker} is not closed`);
  return markup.slice(start, end);
}

// Both navigations carry the same views in the same order, so the sidebar and the mobile bar can
// never disagree about where a view lives.
function menuOrder(markup) {
  return [...markup.matchAll(/data-view="([a-z-]+)"|id="mobileSettings"/g)].map((match) => match[1] || "tetapan");
}

// The mobile layout lives in one media query; the assertions must look at the rules inside it,
// because the bar is deliberately hidden everywhere else.
function mediaBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${marker} is missing from styles.css`);
  const open = source.indexOf("{", start);
  const end = source.indexOf("@media print", open);
  assert.ok(open > 0 && end > open, `${marker} is not closed`);
  return source.slice(open, end);
}

test("relief leads the menu on both the sidebar and the mobile bar", () => {
  const expected = ["hari-ini", "jadual", "guru", "tetapan"];
  assert.deepEqual(menuOrder(navBlock(html, '<nav class="nav-list">')), expected, "sidebar order changed");
  assert.deepEqual(menuOrder(navBlock(html, '<nav class="bottom-nav"')), expected, "mobile bar order changed");
});

test("the mobile bar spreads its buttons across the whole width", () => {
  const nav = navBlock(html, '<nav class="bottom-nav"');
  assert.ok(nav.includes('data-view="hari-ini"'), "the mobile bar lost the relief entry");
  const mobile = mediaBlock(css, "@media (max-width: 760px)");
  const rule = mobile.match(/\.bottom-nav \{[^}]*\}/);
  assert.ok(rule, "the mobile bar has no rule in the mobile layout");
  assert.equal(/repeat\(5/.test(rule[0]), false, "the bar still reserves five columns for four buttons, which pushed the menu left");
  assert.match(rule[0], /display:\s*flex/, "the bar must lay its visible buttons out in a row");
  const button = mobile.match(/\.bottom-nav button \{[^}]*\}/);
  assert.ok(button, "the mobile bar button rule is missing");
  assert.match(button[0], /flex:\s*1/, "each visible button must share the width equally");
});

// The public stylesheet used to fix the bar at three columns for two public buttons; a leftover
// column rule there would bring the empty right-hand slot back.
test("no stylesheet pins the mobile bar to a fixed number of columns", () => {
  const publicCss = read("public-ui.css");
  for (const [name, source] of [["styles.css", css], ["public-ui.css", publicCss]]) {
    const fixed = source.match(/\.bottom-nav\s*\{[^}]*grid-template-columns[^}]*\}/g) || [];
    assert.equal(fixed.length, 0, `${name} still sizes the mobile bar with fixed columns: ${fixed.join(" ")}`);
  }
});

test("opening the app lands on relief, not the timetable", () => {
  assert.match(app, /renderAll\(\); showView\("hari-ini"\);/, "the first screen after load is not relief");
  assert.equal(/renderAll\(\); showView\("jadual"\);/.test(app), false, "the timetable is still the opening screen");
  assert.match(app, /setScheduleMode\('relief'\);showView\('hari-ini'\);/, "leaving admin must land on relief");
});
