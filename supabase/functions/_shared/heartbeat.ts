// Heartbeat cho Ops Guardian Stage 3.2b.
//
// NGUYEN TAC BAT BUOC: heartbeat la quan trac, KHONG BAO GIO duoc lam chet
// business logic. Moi loi deu bi nuot va chi log ra console.
//
// Ly do: report_automation_run() nem exception P0001 neu job_name sai chinh ta
// hoac chua dang ky trong automation.job_registry. Neu khong bao try/catch,
// mot loi go nham se lam chet ca function giua nghiep vu that.

import { createClient } from "jsr:@supabase/supabase-js@2";

export type RunStatus = "ok" | "error" | "skipped";

/**
 * Ghi nhan mot lan chay vao automation.automation_runs.
 *
 * @param jobName   PHAI khop chinh xac automation.job_registry.job_name.
 *                  Xem bang map trong file huong dan Stage 3.2b.
 * @param status    'ok' se tu dong dong alert dang mo cua job nay.
 *                  'error' giu alert mo.
 * @param startedAt Gia tri performance.now() luc bat dau handler.
 * @param detail    Payload tuy y (jsonb). Dung cho semantic validator o 3.2c.
 * @param errorMessage Chi truyen khi status='error'.
 */
export async function reportRun(
  jobName: string,
  status: RunStatus,
  startedAt: number,
  detail: Record<string, unknown> | null = null,
  errorMessage: string | null = null,
): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      console.error("[heartbeat] thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY");
      return;
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.rpc("report_automation_run", {
      p_job_name: jobName,
      p_status: status,
      p_duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      p_detail: detail,
      p_error_message: errorMessage,
    });

    if (error) {
      // UNKNOWN_JOB = ten job sai hoac is_active=false trong job_registry.
      console.error(`[heartbeat] ${jobName} that bai: ${error.message}`);
    }
  } catch (e) {
    console.error(
      `[heartbeat] ${jobName} exception: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
