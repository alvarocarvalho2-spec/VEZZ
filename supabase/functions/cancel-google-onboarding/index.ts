import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { createHandler } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(createHandler(() => ({
  admin: createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }),
  publicClient: createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } }),
})));
