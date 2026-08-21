import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/token-crypto";

const AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL="https://oauth2.googleapis.com/token";
const API="https://www.googleapis.com/calendar/v3";
const SCOPE="https://www.googleapis.com/auth/calendar.readonly";

type TokenResponse={access_token?:string;refresh_token?:string;scope?:string;error?:string;error_description?:string};
type CalendarMeta={id?:string;summary?:string;timeZone?:string};
type EventDate={date?:string;dateTime?:string;timeZone?:string};
type GoogleEvent={id?:string;summary?:string;location?:string;status?:string;start?:EventDate;end?:EventDate;recurringEventId?:string;updated?:string;attendees?:Array<{self?:boolean;responseStatus?:string}>};
type EventList={items?:GoogleEvent[];nextPageToken?:string};

export interface CalendarConnectionStatus { connected:boolean;configured:boolean;providerAccountEmail:string|null;calendarName:string|null;timezone:string|null;lastSyncedAt:string|null;syncStatus:string|null;syncError:string|null; }

function config(){const clientId=process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim(),clientSecret=process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim(),redirectUri=process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();if(!clientId||!clientSecret||!redirectUri)throw new Error("Google Calendar OAuth não configurado.");return{clientId,clientSecret,redirectUri};}
export function googleCalendarConfigured(){return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()&&process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()&&process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim()&&process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()&&process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim());}
export function buildGoogleCalendarAuthorizationUrl(state:string){const{clientId,redirectUri}=config();return `${AUTH_URL}?${new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:SCOPE,access_type:"offline",include_granted_scopes:"true",prompt:"consent",state}).toString()}`;}
async function json<T>(r:Response):Promise<T>{const body=await r.json().catch(()=>({})) as T&{error?:string|{message?:string};error_description?:string};if(!r.ok){const nested=typeof body.error==="object"?body.error?.message:body.error;throw new Error(body.error_description||nested||`Google API HTTP ${r.status}`);}return body;}
export async function exchangeGoogleAuthorizationCode(code:string){const{clientId,clientSecret,redirectUri}=config();return json<TokenResponse>(await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:"authorization_code"}),cache:"no-store"}));}
async function refresh(refreshToken:string){const{clientId,clientSecret}=config();const t=await json<TokenResponse>(await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({refresh_token:refreshToken,client_id:clientId,client_secret:clientSecret,grant_type:"refresh_token"}),cache:"no-store"}));if(!t.access_token)throw new Error("Google não retornou access_token.");return t.access_token;}
async function get<T>(path:string,token:string){return json<T>(await fetch(`${API}${path}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"}));}
async function primary(token:string){return get<CalendarMeta>("/users/me/calendarList/primary",token);}
function clamp(raw:string|undefined,fallback:number){const n=Number(raw);return Number.isFinite(n)?Math.min(Math.max(Math.round(n),1),365):fallback;}
function addDays(d:Date,n:number){const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x;}
function localDate(v:EventDate|undefined){return v?.date??(v?.dateTime?.slice(0,10)??null);}
function instant(v:EventDate|undefined,end=false){if(v?.dateTime){const d=new Date(v.dateTime);return Number.isNaN(d.getTime())?null:d.toISOString();}if(v?.date){const d=new Date(`${v.date}T00:00:00.000Z`);if(end)d.setUTCMilliseconds(d.getUTCMilliseconds()-1);return d.toISOString();}return null;}
function attendance(e:GoogleEvent){const s=e.attendees?.find(a=>a.self)?.responseStatus;return ["accepted","tentative","needsAction","declined"].includes(s??"")?s:"unknown";}
async function listEvents(token:string,calendarId:string,timeMin:string,timeMax:string){const out:GoogleEvent[]=[];let pageToken:string|undefined;for(let page=0;page<10;page++){const q=new URLSearchParams({timeMin,timeMax,singleEvents:"true",orderBy:"startTime",maxResults:"2500"});if(pageToken)q.set("pageToken",pageToken);const data=await get<EventList>(`/calendars/${encodeURIComponent(calendarId)}/events?${q}`,token);out.push(...(data.items??[]));pageToken=data.nextPageToken;if(!pageToken)break;}return out;}

export async function saveGoogleCalendarConnection(o:{userId:string;refreshToken:string;accessToken:string;scope?:string}){const admin=createAdminClient(),cal=await primary(o.accessToken),calendarId=cal.id||"primary",now=new Date().toISOString();let r=await admin.from("pipinho_calendar_connections").upsert({user_id:o.userId,provider:"google",provider_account_email:cal.id??null,calendar_id:calendarId,calendar_name:cal.summary??"Google Calendar",timezone:cal.timeZone??"UTC",scope:o.scope??SCOPE,connected_at:now,updated_at:now,sync_status:"connected",sync_error:null},{onConflict:"user_id"});if(r.error)throw new Error(r.error.message);r=await admin.from("pipinho_calendar_credentials").upsert({user_id:o.userId,encrypted_refresh_token:encryptSecret(o.refreshToken),updated_at:now},{onConflict:"user_id"});if(r.error)throw new Error(r.error.message);}

export async function getCalendarConnectionStatus(userId:string):Promise<CalendarConnectionStatus>{const configured=googleCalendarConfigured();if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return{connected:false,configured,providerAccountEmail:null,calendarName:null,timezone:null,lastSyncedAt:null,syncStatus:null,syncError:null};const admin=createAdminClient();const{data,error}=await admin.from("pipinho_calendar_connections").select("provider_account_email,calendar_name,timezone,last_synced_at,sync_status,sync_error").eq("user_id",userId).maybeSingle();if(error)throw new Error(error.message);return{connected:Boolean(data),configured,providerAccountEmail:data?.provider_account_email??null,calendarName:data?.calendar_name??null,timezone:data?.timezone??null,lastSyncedAt:data?.last_synced_at??null,syncStatus:data?.sync_status??null,syncError:data?.sync_error??null};}

export async function syncGoogleCalendar(userId:string){const admin=createAdminClient();const{data:conn,error:ce}=await admin.from("pipinho_calendar_connections").select("calendar_id,calendar_name,timezone").eq("user_id",userId).single();if(ce||!conn)throw new Error("Google Calendar ainda não está conectado.");const{data:cred,error:re}=await admin.from("pipinho_calendar_credentials").select("encrypted_refresh_token").eq("user_id",userId).single();if(re||!cred?.encrypted_refresh_token)throw new Error("Credencial do Google Calendar não encontrada. Reconecte o calendário.");await admin.from("pipinho_calendar_connections").update({sync_status:"syncing",sync_error:null,updated_at:new Date().toISOString()}).eq("user_id",userId);
 try{const token=await refresh(decryptSecret(cred.encrypted_refresh_token)),cal=await primary(token),calendarId=cal.id||conn.calendar_id||"primary",now=new Date(),timeMin=addDays(now,-clamp(process.env.PIPINHO_CALENDAR_PAST_DAYS,30)).toISOString(),timeMax=addDays(now,clamp(process.env.PIPINHO_CALENDAR_FUTURE_DAYS,90)).toISOString(),events=await listEvents(token,calendarId,timeMin,timeMax),batch=randomUUID(),stamp=new Date().toISOString();const rows=events.flatMap(e=>{if(!e.id||e.status==="cancelled")return[];const ls=localDate(e.start),le0=localDate(e.end),sa=instant(e.start),ea=instant(e.end,Boolean(e.end?.date));if(!ls||!le0||!sa||!ea)return[];const allDay=Boolean(e.start?.date),le=allDay?new Date(new Date(`${le0}T00:00:00.000Z`).getTime()-86400000).toISOString().slice(0,10):le0;return[{user_id:userId,provider:"google",calendar_id:calendarId,provider_event_id:e.id,title:(e.summary?.trim()||"Compromisso sem título").slice(0,240),location:e.location?.trim().slice(0,300)||null,starts_at:sa,ends_at:ea,local_start_date:ls,local_end_date:le,all_day:allDay,attendance_status:attendance(e),event_status:e.status??"confirmed",recurring_event_id:e.recurringEventId??null,provider_updated_at:e.updated??null,sync_batch_id:batch,updated_at:stamp}];});if(rows.length){const u=await admin.from("pipinho_calendar_events").upsert(rows,{onConflict:"user_id,provider,calendar_id,provider_event_id"});if(u.error)throw new Error(u.error.message);}const clean=await admin.from("pipinho_calendar_events").delete().eq("user_id",userId).eq("provider","google").neq("sync_batch_id",batch);if(clean.error)throw new Error(clean.error.message);const done=new Date().toISOString(),up=await admin.from("pipinho_calendar_connections").update({provider_account_email:cal.id??conn.calendar_id??null,calendar_id:calendarId,calendar_name:cal.summary??conn.calendar_name??"Google Calendar",timezone:cal.timeZone??conn.timezone??"UTC",last_synced_at:done,sync_status:"ok",sync_error:null,updated_at:done}).eq("user_id",userId);if(up.error)throw new Error(up.error.message);return{status:"ok" as const,syncedAt:done,eventCount:rows.length,window:{timeMin,timeMax},timezone:cal.timeZone??conn.timezone??"UTC"};}catch(error){const message=error instanceof Error?error.message:"Falha ao sincronizar Google Calendar.";await admin.from("pipinho_calendar_connections").update({sync_status:"error",sync_error:message.slice(0,500),updated_at:new Date().toISOString()}).eq("user_id",userId);throw error;}}
export async function disconnectGoogleCalendar(userId:string){const admin=createAdminClient();await admin.from("pipinho_calendar_events").delete().eq("user_id",userId);const{error}=await admin.from("pipinho_calendar_connections").delete().eq("user_id",userId);if(error)throw new Error(error.message);return{status:"ok" as const};}


const syncLocks = new Map<string, Promise<CalendarConnectionStatus>>();
function autoSyncMinutes(){return clamp(process.env.PIPINHO_CALENDAR_AUTO_SYNC_MINUTES,15);}
function needsAutoSync(connection:CalendarConnectionStatus){
  if(!connection.connected||!connection.configured)return false;
  if(!connection.lastSyncedAt)return true;
  const stamp=new Date(connection.lastSyncedAt).getTime();
  return !Number.isFinite(stamp)||Date.now()-stamp>=autoSyncMinutes()*60_000;
}
export async function ensureGoogleCalendarFresh(userId:string,connection?:CalendarConnectionStatus){
  const current=connection??await getCalendarConnectionStatus(userId);
  if(!needsAutoSync(current))return current;
  const existing=syncLocks.get(userId);
  if(existing)return existing;
  const task=(async()=>{
    try{await syncGoogleCalendar(userId);}finally{syncLocks.delete(userId);}
    return getCalendarConnectionStatus(userId);
  })();
  syncLocks.set(userId,task);
  return task;
}
