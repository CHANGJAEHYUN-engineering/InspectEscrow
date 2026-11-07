"use strict";
const fs=require("node:fs"),vm=require("node:vm");
const s=fs.readFileSync(__dirname+"\\static\\cloud-live.html","utf8");
const match=s.match(/<script>([\s\S]*?)<\/script>/i);
if(!match)throw Error("FRONTEND_SCRIPT_MISSING");
new vm.Script(match[1],{filename:"cloud-live.html:inline-script"});
for(const v of ["AI 추론","Evidence","cameraBtn","inspectBtn","verifyBtn","X-Demo-Token"]){
  if(!s.includes(v))throw Error("MISSING_UI_ELEMENT_"+v);
}
console.log("PASS: FRONTEND_JAVASCRIPT_SYNTAX_AND_REQUIRED_CONTROLS");
