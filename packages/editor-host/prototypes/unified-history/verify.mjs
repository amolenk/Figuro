// Throwaway experiment assertions, not a production test suite.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../slidev/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({viewport:{width:1400,height:1000}});
const errors=[];page.on("pageerror",error=>{errors.push(String(error));console.log("page error",error.stack);});page.on("console",message=>{if(message.type()==="error")console.log("console error",message.text());});
const read=()=>page.evaluate(()=>window.historyPrototype.read());
const run=async(name,arg)=>{await page.evaluate(async({name,arg})=>{await window.historyPrototype.actions[name](arg);await window.historyPrototype.settled();},{name,arg});await page.waitForTimeout(100);return read();};
const results={};
try {
  await page.goto("http://127.0.0.1:5198");
  await page.waitForFunction(()=>window.historyPrototype?.ready());
  let s=await read();assert.equal(s.history.undoEntries,0);
  await run("draw");await run("pause");await run("move");s=await run("rename");
  assert.equal(s.history.undoEntries,4);assert.equal(s.documentData.cards[0].title,"Explain API");assert.equal(s.elements[0].x,260);
  s=await run("undo");assert.equal(s.documentData.cards[0].title,"Pause");assert.equal(s.elements[0].x,260);
  s=await run("undo");assert.equal(s.elements[0].x,200);assert.equal(s.documentData.cards.length,1);
  s=await run("undo");assert.equal(s.documentData.cards.length,0);assert.equal(s.elements.length,1);
  s=await run("undo");assert.equal(s.elements.length,0);assert.equal(s.dirty,false);
  for(let i=0;i<4;i++)s=await run("redo");
  assert.equal(s.documentData.cards[0].title,"Explain API");assert.equal(s.elements[0].x,260);
  results.chronology="draw → pause → move → rename undid/redid in exact order; undo to baseline was clean";
  s=await run("rename");assert.equal(s.history.undoEntries,4);
  results.noOp="same title did not create an entry";
  await run("undo");s=await run("select");assert.equal(s.history.canRedo,true);
  s=await run("rename","New branch");assert.equal(s.history.canRedo,false);
  results.branching="selection preserved redo; new metadata edit cleared it";
  await run("reset");await run("draw");const entryCount=(await read()).history.undoEntries;s=await run("selectImmediately");assert.equal(s.history.undoEntries,entryCount);
  results.viewHistory="even an IMMEDIATELY-captured selection-only update did not create a document undo entry";
  await run("pause");await run("pause");s=await read();const order=s.documentData.cards.map(card=>card.id);
  s=await run("reorder");assert.deepEqual(s.documentData.cards.map(card=>card.id),[...order].reverse());
  s=await run("undo");assert.deepEqual(s.documentData.cards.map(card=>card.id),order);
  s=await run("redo");assert.deepEqual(s.documentData.cards.map(card=>card.id),[...order].reverse());
  const notifications=s.statusEvents;s=await run("reset");assert.ok(s.statusEvents>notifications);assert.equal(s.history.canUndo,false);assert.equal(s.history.canRedo,false);
  results.orderAndStatus="metadata-only reorder undo/redo worked; reset published cleared history status";

  await run("reset");await run("draw");await run("pause");s=await run("reveal");
  assert.equal(s.history.undoEntries,3);assert.equal(s.documentData.cards[0].actions.length,1);
  s=await run("delete");assert.equal(s.history.undoEntries,4);assert.equal(s.elements.length,0);assert.equal(s.documentData.cards[0].actions.length,0);
  s=await run("undo");assert.equal(s.elements.length,1);assert.equal(s.documentData.cards[0].actions.length,1);
  s=await run("redo");assert.equal(s.elements.length,0);assert.equal(s.documentData.cards.length,1);
  results.deletion="one drawing deletion commit included target cleanup; undo restored shape+actions; empty click survived";
  // Exercise the built-in Delete action too, not only imperative scene updates.
  await run("undo");await run("select");await page.locator(".excalidraw-container").focus();await page.keyboard.press("Delete");await page.waitForTimeout(200);
  s=await read();assert.equal(s.elements.length,0);assert.equal(s.documentData.cards[0].actions.length,0);
  s=await run("undo");assert.equal(s.elements.length,1);assert.equal(s.documentData.cards[0].actions.length,1);
  results.keyboardDeletion="native Excalidraw Delete action included atomic metadata cleanup";

  await run("reset");await run("pause");await run("rename");await run("save");s=await run("rename","Later");assert.equal(s.dirty,true);
  s=await run("undo");assert.equal(s.dirty,false);s=await run("redo");assert.equal(s.dirty,true);
  s=await run("reopen");assert.equal(s.documentData.cards[0].title,"Explain API");assert.equal(s.history.undoEntries,0);assert.equal(s.history.redoEntries,0);assert.equal(s.dirty,false);
  results.persistence="empty titled click survived explicit JSON save/restore; reopen reset history; saved-state undo/redo comparison worked";

  await run("reset");await run("draw");await run("annotation",{figuro:{v:1,step:1}});s=await run("undo");assert.equal(s.elements[0].customData ?? null,null);
  await run("redo");await run("annotation",undefined);await run("undo");s=await run("redo");assert.equal(s.elements[0].customData ?? null,null);
  results.optionalMetadata="delta-application repair restored absent customData on first annotation undo and final removal redo";

  await run("reset");await run("draw");
  const point=await page.evaluate(()=>window.historyPrototype.dragPoint());
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  for(let i=1;i<=12;i++){await page.mouse.move(point.x+i*5,point.y+i*2);await page.waitForTimeout(20);}
  const busy=await page.evaluate(()=>window.historyPrototype.command("undo"));assert.equal(busy.outcome,"busy");
  await page.mouse.up();await page.waitForTimeout(200);s=await read();assert.equal(s.history.undoEntries,2);assert.equal(s.elements[0].x,260);
  // Browser keyboard/toolbar retain the original history actions.
  await page.locator(".excalidraw-container").focus();await page.keyboard.press("Control+z");await page.waitForTimeout(200);s=await read();assert.equal(s.elements[0].x,200);
  await page.getByTestId("button-redo").click();await page.waitForTimeout(200);s=await read();assert.equal(s.elements[0].x,260);
  results.gesture="drag stayed one entry; command refused mid-drag; built-in keyboard undo and footer redo shared the extended history";

  await run("reset");s=await run("boundScene");
  const originalLabel=s.elements.find(el=>el.type==="text");assert.ok(originalLabel.containerId);
  const originalArrow=s.elements.find(el=>el.type==="arrow");assert.equal(originalArrow.startBinding.elementId,"container");
  await run("pause");await run("move");await run("rename");await run("undo");s=await run("undo");
  assert.equal(s.elements.find(el=>el.id==="container").x,200);assert.equal(s.elements.find(el=>el.type==="text").containerId,"container");
  assert.equal(s.elements.find(el=>el.type==="arrow").startBinding.elementId,"container");
  assert.ok(s.elements.find(el=>el.id==="container").boundElements.some(el=>el.id===originalLabel.id));
  results.bindings="mixed metadata/drawing replay retained bound label, container, and arrow binding references";
  await run("reset");await run("image");await run("pause");await run("delete");s=await run("undo");
  assert.equal(s.elements[0].type,"image");assert.ok((await page.evaluate(()=>window.historyPrototype.fileIDs())).includes("prototype-image"));
  await run("redo");s=await run("undo");assert.equal(s.elements[0].fileId,"prototype-image");
  results.image="image deletion undo/redo retained the referenced in-memory asset";
  assert.deepEqual(errors,[]);results.pageErrors=errors;
  console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}
