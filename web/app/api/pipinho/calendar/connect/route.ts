import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { buildGoogleCalendarAuthorizationUrl, googleCalendarConfigured } from "@/lib/google-calendar";
export const dynamic="force-dynamic";
export async function GET(request:Request){const auth=await requireApiUser();if(!auth.ok)return NextResponse.redirect(new URL("/login",request.url));if(!googleCalendarConfigured()){const u=new URL("/rotina",request.url);u.searchParams.set("calendarError","oauth_not_configured");return NextResponse.redirect(u);}const state=randomBytes(32).toString("base64url"),res=NextResponse.redirect(buildGoogleCalendarAuthorizationUrl(state));res.cookies.set("pipinho_google_calendar_state",state,{httpOnly:true,secure:new URL(request.url).protocol==="https:",sameSite:"lax",maxAge:600,path:"/api/pipinho/calendar/callback"});return res;}
