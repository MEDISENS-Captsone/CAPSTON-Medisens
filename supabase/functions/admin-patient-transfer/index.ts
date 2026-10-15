import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const url=Deno.env.get('SUPABASE_URL')??Deno.env.get('PROJECT_URL');
const anonKey=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('ANON_KEY');
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SERVICE_ROLE_KEY');
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json({error:'Method not allowed.'},405);
  if(!url||!anonKey||!serviceKey)return json({error:'Transfer service is not configured.'},503);
  const authorization=req.headers.get('Authorization');
  if(!authorization)return json({error:'Sign in to continue.'},401);
  try{
    const userClient=createClient(url,anonKey,{global:{headers:{Authorization:authorization}}});
    const serverClient=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:auth,error:authError}=await userClient.auth.getUser();
    if(authError||!auth.user)return json({error:'Your session is invalid. Sign in again.'},401);
    const {data:profile,error:profileError}=await serverClient.from('profiles').select('id,role,is_active').eq('id',auth.user.id).maybeSingle();
    if(profileError||profile?.id!==auth.user.id||profile.role!=='admin'||profile.is_active!==true)return json({error:'Only active Admin accounts can transfer patient records.'},403);
    const raw=await req.text();
    if(new TextEncoder().encode(raw).byteLength>12*1024*1024)return json({error:'Transfer request exceeds the allowed size.'},413);
    let body:Record<string,unknown>;
    try{body=JSON.parse(raw) as Record<string,unknown>;}catch{return json({error:'Invalid transfer request.'},400);}
    const action=body.action;
    if(action==='import'||action==='export'){
      if(action==='import'&&(typeof body.source_system!=='string'||!Array.isArray(body.patients)))return json({error:'Invalid import payload.'},400);
      if(action==='export'&&(!Array.isArray(body.patient_ids)||!['xlsx','csv'].includes(String(body.format))))return json({error:'Select patients and an export format.'},400);
      const secureResponse=await fetch(`${url.replace(/\/$/,'')}/functions/v1/medisens-secure-records`,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':anonKey,'Authorization':authorization},
        body:JSON.stringify(action==='import'?{action:'bulk_import',source_system:body.source_system,patients:body.patients}:{action:'bulk_export',patient_ids:body.patient_ids,format:body.format}),
      });
      const secureBody=await secureResponse.text();
      return new Response(secureBody,{status:secureResponse.status,headers:{...corsHeaders,'Content-Type':secureResponse.headers.get('Content-Type')??'application/json'}});
    }
    let rpcName:string;let params:Record<string,unknown>;
    if(action==='search'){
      const query=typeof body.query==='string'?body.query.slice(0,120):'';
      const archiveStatus=['all','active','archived'].includes(String(body.archive_status))?String(body.archive_status):'active';
      const limit=Math.min(Math.max(Number(body.limit)||50,1),100);
      const offset=Math.min(Math.max(Number(body.offset)||0,0),1000000);
      rpcName='admin_patient_transfer_search';params={p_query:query,p_archive_status:archiveStatus,p_limit:limit,p_offset:offset,p_actor_id:auth.user.id};
    }else if(action==='export_complete'||action==='export_failed'){
      if(typeof body.operation_id!=='string')return json({error:'Invalid export receipt.'},400);
      rpcName=action==='export_complete'?'admin_patient_transfer_export_complete':'admin_patient_transfer_export_failed';
      params={p_operation_id:body.operation_id,p_actor_id:auth.user.id};
    }else if(action==='history'){
      rpcName='admin_patient_transfer_history';params={p_limit:Math.min(Math.max(Number(body.limit)||100,1),200),p_actor_id:auth.user.id};
    }else return json({error:'Unsupported transfer action.'},400);
    const {data,error}=await serverClient.rpc(rpcName,params);
    if(error){
      // Do not log patient values or database messages that may include PHI.
      console.error('[admin-patient-transfer] operation rejected',{action,code:error.code});
      return json({error:'The transfer could not be completed. Check the workbook and your Admin access.'},400);
    }
    return json({data});
  }catch{
    console.error('[admin-patient-transfer] unexpected server failure');
    return json({error:'The transfer service is temporarily unavailable.'},500);
  }
});
