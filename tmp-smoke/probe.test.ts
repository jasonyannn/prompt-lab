import { it } from "vitest";
import { createPromptLabMcpServer } from "../server/mcp";
const ROW = { id:"p-1", title:"Launch email", content:"Act as a growth marketer.\n\nContext I am giving you\n- What you are launching: {{what you are launching}}", category:"Marketing", agent_id:null, rating:null, usage_count:0, family_id:"f-1", parent_prompt_id:null, version_label:null, created_at:"x", updated_at:"x" };
function fakeDb(){const s=(sql:string)=>{const r=()=>/SELECT \* FROM prompts/i.test(sql)?{results:[ROW]}:{results:[]};const a:any={bind:()=>a,all:async()=>r(),run:async()=>({success:true}),first:async()=>null};return a;};return {prepare:s,batch:async()=>[],exec:async()=>({})};}
it("probe", async () => {
  const { server } = await createPromptLabMcpServer(fakeDb() as never);
  const p = (server as any)._registeredPrompts["launch-email"];
  console.log("KEYS:", Object.keys(p));
  for (const k of Object.keys(p)) console.log(k, typeof p[k]);
});
