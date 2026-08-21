import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
let admin: ReturnType<typeof createClient<Database>> | null = null;
export function createAdminClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor do frontend.");
  admin ??= createClient<Database>(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  return admin;
}
