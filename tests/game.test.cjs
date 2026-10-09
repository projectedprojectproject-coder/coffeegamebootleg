const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// Load the game's exported rules without mounting a browser canvas.
const core = script.slice(0, script.indexOf('const game=Daldongne.mount'));
const context = {module: {exports: {}}};
vm.runInNewContext(core, context);
const g = context.module.exports;
// Keep one enemy quiet so a test can look at the other in isolation.
const noCat = s => {s.cats = [];s.catTimer = 1e9};
const noUfo = s => {s.stars = [];s.ufo.timer = 1e9};
const run = (s, seconds) => {for (let t = 0; t < seconds; t += .05) g.step(s, .05)};

test('ready state does not move or deliver; start and pause control time', () => {
  const s = g.newGame();
  const initial = JSON.stringify(s.n);
  g.step(s, .02, {x: 1});
  assert.equal(JSON.stringify(s.n), initial);
  assert.equal(g.interact(s), false);
  g.start(s);g.step(s,.02);
  assert.equal(s.time,.02);
  g.pause(s);g.step(s,.02);
  assert.equal(s.time,.02);
  g.pause(s);assert.equal(s.status,'playing');
});
test('bear friends cannot be interacted with before coffee is picked up', () => {
  const s = g.newGame();g.start(s);
  s.n = g.ORDERS[0].door;
  assert.equal(g.nearest(s),null);
  assert.equal(g.interact(s),false);
  assert.equal(s.done.length,0);
  assert.equal(s.target,'cafe');
  s.n = g.math.at(0,-1.4);
  assert.equal(g.interact(s),false);
});
test('pick up six cups, deliver to six bears, then return to the cafe for assessment', () => {
  const s = g.newGame();g.start(s);s.n=g.CAFE.door;
  assert.equal(g.ORDERS.length,6);
  assert.equal(g.interact(s),true);assert.equal(s.carrying,6);
  assert.equal(g.interact(s),false);assert.equal(s.carrying,6);
  for (const [i,site] of g.ORDERS.entries()) {
    s.n=site.door;assert.equal(g.interact(s),true);
    assert.equal(s.done.length,i+1);assert.equal(s.carrying,5-i);
    assert.equal(g.interact(s),false);assert.equal(s.done.length,i+1);
  }
  assert.equal(s.status,'playing');assert.equal(s.target,'cafe');
  s.n=g.CAFE.door;assert.equal(g.interact(s),true);
  assert.equal(s.status,'won');assert.equal(s.grade,3);
  const fresh=g.newGame();assert.equal(fresh.status,'ready');
  assert.equal(fresh.done.length,0);assert.equal(fresh.carrying,0);assert.equal(fresh.hearts,3);
});
test('each hit drains one heart, with a short grace period; zero hearts ends the game', () => {
  const s = g.newGame();g.start(s);noCat(s);noUfo(s);
  assert.equal(g.hurt(s,'cat'),true);assert.equal(s.hearts,2);
  assert.equal(g.hurt(s,'star'),false);assert.equal(s.hearts,2);
  run(s,2);assert.equal(g.hurt(s,'star'),true);assert.equal(s.hearts,1);
  run(s,2);assert.equal(g.hurt(s,'cat'),true);
  assert.equal(s.hearts,0);assert.equal(s.status,'lost');
});
test('alien cat strolls toward the player and only arms its fuse when close', () => {
  const s = g.newGame();g.start(s);noUfo(s);noCat(s);
  s.cats = [{n:g.math.offset(s.n,s.north,0,.9),fuse:-1,dir:s.north}];
  run(s,1);
  const d = g.math.angle(s.cats[0].n,s.n);
  assert.ok(d < .9 && d > .9 - g.CAT.slow * 1.2);
  assert.equal(s.cats[0].fuse,-1);
  s.cats[0].n = g.math.offset(s.n,s.north,0,.4);
  run(s,.2);
  assert.ok(s.cats[0].fuse > 0);assert.equal(s.hearts,3);
});
test('armed cat charges, explodes on reaching a player who stands still, and costs one heart', () => {
  const s = g.newGame();g.start(s);noUfo(s);noCat(s);
  s.cats = [{n:g.math.offset(s.n,s.north,0,.4),fuse:-1,dir:s.north}];
  while (s.cats.length && s.time < 10) g.step(s,.05);
  assert.equal(s.cats.length,0);assert.equal(s.hearts,2);
  assert.ok(s.time < g.CAT.fuse);
});
test('armed cat speeds up but can barely steer', () => {
  const s = g.newGame();g.start(s);noUfo(s);noCat(s);
  // Armed and pointed directly away from the player.
  const n = g.math.offset(s.n,s.north,0,.3), away = g.math.frame(n).u;
  const cat = {n,fuse:0,dir:away};s.cats = [cat];
  const p0 = cat.n;run(s,.5);const p1 = cat.n;run(s,.5);const p2 = cat.n;
  assert.ok(g.math.angle(p1,p2) > g.math.angle(p0,p1) * 1.2);
  assert.ok(g.math.angle(p2,s.n) > .3);
  const turned = g.math.angle(cat.dir,g.math.frame(cat.n).u);
  assert.ok(turned < g.CAT.turn * 1.3 + .1);
});
test('fuse blast only hurts inside the blast radius', () => {
  const s = g.newGame();g.start(s);noUfo(s);noCat(s);
  const side = g.math.frame(s.n).e;
  s.cats = [{n:g.math.offset(s.n,s.north,0,.4),fuse:g.CAT.fuse-.01,dir:side}];
  run(s,.1);
  assert.equal(s.cats.length,0);assert.equal(s.hearts,3);
  s.cats = [{n:g.math.offset(s.n,s.north,0,.12),fuse:g.CAT.fuse-.01,dir:side}];
  run(s,.1);
  assert.equal(s.cats.length,0);assert.equal(s.hearts,2);
});
test('several cats roam at once, never more than the cap', () => {
  const s = g.newGame();g.start(s);noUfo(s);s.invuln = 1e9;
  let most = 0;
  for (let i = 0; i < 600; i++) {g.step(s,.05);most = Math.max(most,s.cats.length);assert.ok(s.cats.length <= g.CAT.max)}
  assert.ok(most >= 2);
});
test('UFO previews four random star targets; only a star landing on the player hurts', () => {
  const s = g.newGame();g.start(s);noCat(s);
  s.ufo.timer = 0;g.step(s,.05);
  assert.equal(s.stars.length,4);
  for (const st of s.stars) assert.ok(g.math.angle(st.n,s.n) < .6);
  assert.ok(s.stars.every(st => st.life >= g.UFO.warn));
  for (const st of s.stars) st.n = g.math.offset(s.n,s.north,0,1);
  s.ufo.timer = 1e9;run(s,3);
  assert.equal(s.stars.length,0);assert.equal(s.hearts,3);
  s.ufo.timer = 0;g.step(s,.05);s.ufo.timer = 1e9;
  for (const st of s.stars) st.n = g.math.offset(s.n,s.north,0,1);
  s.stars[0].n = s.n;run(s,3);
  assert.equal(s.hearts,2);
});
test('transparent mines stay clear of the start and doorsteps, and stepping on one costs a heart once', () => {
  const s = g.newGame();g.start(s);noCat(s);noUfo(s);
  assert.equal(s.mines.length,g.MINE.count);
  for (const m of s.mines) {
    assert.ok(g.math.angle(m.n,s.n) >= .3);
    for (const site of g.SITES) assert.ok(g.math.angle(m.n,site.door) >= .2);
  }
  run(s,1);assert.equal(s.hearts,3);assert.equal(s.mines.length,g.MINE.count);
  s.n = s.mines[0].n;g.step(s,.05);
  assert.equal(s.hearts,2);assert.equal(s.mines.length,g.MINE.count-1);
  run(s,3);assert.equal(s.hearts,2);
});
