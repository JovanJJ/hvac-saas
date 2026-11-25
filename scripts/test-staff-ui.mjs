// Final production UI acceptance with a loopback-only, selective RPC failure proxy.
// Run after npm run build -- --webpack. No global stack configuration is changed.
import assert from "node:assert/strict";
import { cp } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const upstream = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
assert(upstream, "Supabase API configuration is required");
let fail = false;
const blocked = new Set(["/rest/v1/rpc/schedule_snapshot", "/rest/v1/rpc/visit_review_queue", "/rest/v1/rpc/report_list", "/rest/v1/rpc/office_work_queue", "/rest/v1/rpc/handover_queue", "/rest/v1/rpc/maintenance_list", "/rest/v1/rpc/report_links", "/rest/v1/rpc/report_receipts", "/rest/v1/rpc/guest_report"]);
const proxy = createServer(async (req,res) => {
  try {
    if (req.url === "/__test/fail" || req.url === "/__test/recover") {
      fail = req.url === "/__test/fail";
      res.writeHead(204).end(); return;
    }
    if (fail && blocked.has(req.url?.split("?")[0])) {
      await new Promise(resolve => setTimeout(resolve,2000));
      res.writeHead(503,{"Content-Type":"application/json"}).end(JSON.stringify({code:"XX000",message:"Synthetic availability failure"})); return;
    }
    const chunks=[];for await (const chunk of req) chunks.push(chunk);
    const headers={...req.headers};delete headers.host;delete headers["content-length"];delete headers["connection"];
    const response=await fetch(`${upstream.replace(/\/$/, "")}${req.url}`,{method:req.method,headers,body:["GET","HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),redirect:"manual"});
    res.statusCode=response.status;
    for (const [key,value] of response.headers) if (!["content-length","content-encoding","transfer-encoding","connection"].includes(key)) res.setHeader(key,value);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {res.writeHead(502).end();}
});
await new Promise(resolve=>proxy.listen(0,"127.0.0.1",resolve));
const proxyUrl=`http://127.0.0.1:${proxy.address().port}`;
const origin="http://localhost:3002";
let app;
try {
  // Refuse to reuse another process already listening on the acceptance port.
  const probe=createServer();
  await new Promise((resolve,reject)=>{probe.once("error",reject);probe.listen(3002,"127.0.0.1",resolve);});
  await new Promise(resolve=>probe.close(resolve));
  await cp("public",".next/standalone/public",{recursive:true});
  await cp(".next/static",".next/standalone/.next/static",{recursive:true});
  app=spawn(process.execPath,[".next/standalone/server.js"],{env:{...process.env,NODE_ENV:"production",APP_URL:origin,HOSTNAME:"127.0.0.1",PORT:"3002",SUPABASE_INTERNAL_URL:proxyUrl},stdio:"ignore"});
  let ready=false;
  for(let i=0;i<100;i++) {
    try{ready=(await fetch(origin)).ok;if(ready)break;}catch{}
    if(app.exitCode!==null)throw Error("Temporary production server exited");
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert(ready,"Temporary production server did not become ready");
  const suites=process.argv.slice(2);
  const child=spawn("npx",["playwright","test",...(suites.length ? suites : ["tests/staff-overview.spec.ts","tests/staff-overview-errors.spec.ts"]),"--workers=1","--output=/tmp/hvac-staff-ui-results"],{
    env:{...process.env,PLAYWRIGHT_BASE_URL:origin,TEST_STAFF_FAILURE_PROXY_URL:proxyUrl,TEST_LEGAL_PUBLICATION_BLOCKED:"true"},stdio:"inherit",
  });
  assert.equal(await new Promise(resolve=>child.on("exit",resolve)),0);
  console.log("PASS: production staff overview, navigation, isolation and selective RPC failure/recovery.");
} finally {
  app?.kill("SIGTERM");
  proxy.closeAllConnections();
  await new Promise(resolve=>proxy.close(resolve));
}
