// Dry run of the trailer: plays the director's whole cut without drawing frames and prints when
// each catch, cut and stage of the ending happens, for tuning the edit.
import { launch } from './lib/browser.mjs';

const b = await launch({ width: 1280, height: 720 });
await b.open('det&debug&nolock&trailer');
const marks = await b.page.evaluate(() => window.__ffj.director.dryRun());
for (const m of marks) console.log(JSON.stringify(m));
await b.check();
await b.teardown(0);
