import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, CaptureUpdateAction, convertToExcalidrawElements, newElementWith, serializeAsJSON, restore, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

// THROWAWAY host: real Excalidraw store/history owns chronology, not a parallel stack.
const emptyData = () => ({ initial: {}, cards: [] });
let api, renderView, savedProjection, savedJSON, lastView, revision = 0, session = 0, id = 0, statusEvents = 0;
let eventKind = "edit", resetPending = false, commitPending = false;
const events = [];
const copy = value => JSON.parse(JSON.stringify(value));
const project = () => ({
  elements: api.getSceneElements().map(({version,versionNonce,updated,...element}) => element),
  background: api.getAppState().viewBackgroundColor,
  documentData: api.getAppState().documentData ?? null,
});
const read = () => ({
  ...copy(project()),
  history: api.history.getStatus(), revision, session, statusEvents,
  dirty: JSON.stringify(project()) !== savedProjection,
  events: [...events],
});
function postState() {
  if (!api) return;
  const state=read(), view=JSON.stringify(state);
  if(view!==lastView){lastView=view;renderView?.(state);}
  const active = document.activeElement;
  const text = active?.matches("input:not([type=radio]):not([type=checkbox]),textarea,[contenteditable=true]");
  window.webkit?.messageHandlers.figuro?.postMessage({type:"prototypeState",...read(),editingText:!!text,json:saveJSON()});
}
const update = (data, elements) => {
  if (JSON.stringify(data) === JSON.stringify(api.getAppState().documentData) && !elements) return;
  api.updateScene({elements,appState:{documentData:copy(data)},captureUpdate:CaptureUpdateAction.IMMEDIATELY});
};
function saveJSON() {
  const parsed = JSON.parse(serializeAsJSON(api.getSceneElements(),api.getAppState(),api.getFiles(),"local"));
  parsed.figuro = {v:2,storyboard:copy(api.getAppState().documentData ?? emptyData())};
  return JSON.stringify(parsed);
}
async function settled() {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
async function command(direction) {
  eventKind = direction;
  const outcome = api.history.execute(direction);
  await settled();
  if (outcome === "applied") {revision++;events.push({kind:direction,revision});}
  eventKind = "edit"; postState(); return {outcome,...read()};
}
async function load(json) {
  resetPending = true; commitPending = false;
  const parsed = JSON.parse(json);
  const scene = restore(parsed,null,null);
  api.updateScene({elements:scene.elements,appState:{...scene.appState,documentData:parsed.figuro?.storyboard ?? emptyData()},captureUpdate:CaptureUpdateAction.NEVER});
  if (Object.keys(scene.files).length) api.addFiles(Object.values(scene.files));
  await settled();api.history.clear();session++;revision=0;events.length=0;
  savedJSON=saveJSON();savedProjection=JSON.stringify(project());resetPending=false;postState();
}
const actions = {
  async reset() {await load(JSON.stringify({type:"excalidraw",version:2,elements:[],appState:{viewBackgroundColor:"#ffffff"},files:{}}));},
  draw() {api.updateScene({elements:[...api.getSceneElementsIncludingDeleted(),...convertToExcalidrawElements([{type:"rectangle",id:`shape-${++id}`,x:200,y:200,width:160,height:100}])],captureUpdate:CaptureUpdateAction.IMMEDIATELY});},
  pause() {const data=copy(api.getAppState().documentData);data.cards.push({id:`click-${++id}`,title:"Pause",actions:[]});update(data);},
  rename(title="Explain API") {const data=copy(api.getAppState().documentData);if(data.cards[0]){data.cards[0].title=title;update(data);}},
  move() {const elements=api.getSceneElementsIncludingDeleted().map(el=>el.isDeleted?el:newElementWith(el,{x:el.x+60,y:el.y+24}));update(api.getAppState().documentData,elements);},
  reveal() {const data=copy(api.getAppState().documentData);const el=api.getSceneElements()[0];if(el && data.cards[0]){data.initial[el.id]={visible:false};data.cards[0].actions.push({target:el.id,visibility:true});update(data);}},
  delete() {api.updateScene({elements:api.getSceneElementsIncludingDeleted().map(el=>newElementWith(el,{isDeleted:true})),captureUpdate:CaptureUpdateAction.IMMEDIATELY});},
  select() {const el=api.getSceneElements()[0];api.updateScene({appState:{selectedElementIds:el?{[el.id]:true}:{}},captureUpdate:CaptureUpdateAction.EVENTUALLY});},
  selectImmediately() {const el=api.getSceneElements()[0];api.updateScene({appState:{selectedElementIds:el?{[el.id]:true}:{}},captureUpdate:CaptureUpdateAction.IMMEDIATELY});},
  reorder() {const data=copy(api.getAppState().documentData);data.cards.reverse();update(data);},
  annotation(value) {api.updateScene({elements:api.getSceneElementsIncludingDeleted().map(el=>newElementWith(el,{customData:value},true)),captureUpdate:CaptureUpdateAction.IMMEDIATELY});},
  boundScene() {api.updateScene({elements:convertToExcalidrawElements([
    {type:"rectangle",id:"container",x:200,y:200,width:160,height:100,label:{text:"API"}},
    {type:"rectangle",id:"destination",x:500,y:200,width:160,height:100},
    {type:"arrow",id:"connector",x:370,y:250,width:120,height:0,points:[[0,0],[120,0]],start:{id:"container",type:"rectangle"},end:{id:"destination",type:"rectangle"}},
  ],{regenerateIds:false}),captureUpdate:CaptureUpdateAction.IMMEDIATELY});},
  image() {const fileId="prototype-image";api.addFiles([{id:fileId,mimeType:"image/png",dataURL:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQXcAAAAASUVORK5CYII=",created:1}]);api.updateScene({elements:convertToExcalidrawElements([{type:"image",id:"image",fileId,x:200,y:200,width:100,height:100}],{regenerateIds:false}),captureUpdate:CaptureUpdateAction.IMMEDIATELY});},
  undo:()=>command("undo"),redo:()=>command("redo"),
  save() {savedJSON=saveJSON();savedProjection=JSON.stringify(project());postState();return savedJSON;},
  reopen:()=>load(savedJSON),load,
};
window.historyPrototype={actions,read:()=>read(),ready:()=>!!api && !resetPending,settled,
  dragPoint:()=>{const el=api.getSceneElements()[0];return sceneCoordsToViewportCoords({sceneX:el.x+el.width/2,sceneY:el.y},api.getAppState());},
  command,saveJSON,
  fileIDs:()=>Object.keys(api.getFiles()),
};
const scenarioDefinitions={
  chronology:[["Draw a shape","draw"],["Add a pause","pause"],["Move the shape","move"],["Rename the pause","rename"],["Undo rename","undo"],["Undo move","undo"],["Undo pause","undo"],["Undo drawing","undo"],["Redo drawing","redo"],["Redo pause","redo"],["Redo move","redo"],["Redo rename","redo"]],
  branching:[["Draw a shape","draw"],["Add a pause","pause"],["Move shape","move"],["Undo move","undo"],["Select shape (keeps redo)","select"],["Rename pause (discards redo)","rename"]],
  deletion:[["Draw a shape","draw"],["Add click","pause"],["Reveal shape","reveal"],["Delete shape and actions","delete"],["Undo both","undo"],["Redo both","redo"]],
  persistence:[["Add pause in empty drawing","pause"],["Name pause","rename"],["Save snapshot","save"],["Rename again","rename","Different title"],["Reopen snapshot","reopen"]],
};
function onAPI(next){api=next;next.history.prepareDocumentData((elements,data)=>{
  if (!data) return emptyData();
  const live=new Set([...elements.values()].filter(el=>!el.isDeleted).map(el=>el.id));
  const next={initial:Object.fromEntries(Object.entries(data.initial).filter(([target])=>live.has(target))),cards:data.cards.map(card=>({...card,actions:card.actions.filter(action=>live.has(action.target))}))};
  return JSON.stringify(next)===JSON.stringify(data)?data:next;
});next.history.onCommit(()=>{commitPending=true;});setTimeout(()=>{next.history.onStatus(()=>{statusEvents++;});actions.reset();},0);}
function onChange(){
  if(commitPending && !resetPending){revision++;events.push({kind:eventKind,revision});commitPending=false;}
  if (!resetPending) postState();
}
function App(){
  const [state,setState]=useState(null);renderView=setState;
  const [scenario,setScenario]=useState("chronology"),[step,setStep]=useState(0);
  const run=async(name,arg)=>{await actions[name](arg);await settled();postState();};
  return <><header><h1>Shared history — throwaway feasibility prototype</h1><p>Can drawing edits and independent Storyboard cards share Excalidraw’s existing undo history, including deletion, redo branches, and save/reopen?</p><p>State is in memory. “Save” takes a snapshot; no drawing files are written.</p></header><div className="workspace"><Excalidraw excalidrawAPI={onAPI} onChange={onChange}/><aside><strong>Storyboard / history</strong><div className="status" data-testid="history-status">{state?`${state.history.undoEntries} undo • ${state.history.redoEntries} redo • ${state.dirty?"Edited":"Saved"}`:"Loading"}</div>
  <div>{["draw","pause","move","reveal","delete","select","save","reopen","reset"].map(name=><button key={name} data-testid={name} onClick={()=>run(name)}>{name}</button>)}</div>
  <button data-testid="host-undo" disabled={!state?.history.canUndo || state?.history.busy} onClick={()=>run("undo")}>Undo</button><button data-testid="host-redo" disabled={!state?.history.canRedo || state?.history.busy} onClick={()=>run("redo")}>Redo</button>
  <div className="cards">{state?.documentData?.cards.map((card,index)=><div className="card" key={card.id}>Click {index+1}: <input key={`${card.id}-${card.title}`} aria-label="Click title" defaultValue={card.title} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}} onFocus={()=>postState()} onBlur={event=>{run("rename",event.target.value);postState();}}/><div>{card.actions.length?JSON.stringify(card.actions):"Pause"}</div></div>)}</div>
  <div className="scenarios"><strong>Guided walkthroughs</strong><div>{Object.keys(scenarioDefinitions).map(name=><button key={name} aria-pressed={scenario===name} onClick={async()=>{await run("reset");setScenario(name);setStep(0);}}>{name}</button>)}</div>{scenarioDefinitions[scenario].map(([label,name,arg],index)=><button key={index} disabled={index!==step} onClick={async()=>{await run(name,arg);setStep(index+1);}}>{index+1}. {label}</button>)}</div>
  <details open><summary>Full document and history state</summary><pre data-testid="state">{JSON.stringify(state,null,2)}</pre></details></aside></div></>;
}
createRoot(document.getElementById("root")).render(<App/>);
document.addEventListener("focusin",()=>postState());document.addEventListener("focusout",()=>setTimeout(postState,0));
