# Task: Thêm 3 lệnh mới vào Telegram Webhook Bot

## File cần sửa
`supabase/functions/telegram-webhook/index.ts`

---

## BƯỚC 1 — Thêm 2 helper functions vào phần `// ─── Helpers ───`

Thêm ngay sau function `todayICT()`:

```typescript
// Format ngày dd/mm/yyyy cho hiển thị tiếng Việt
function formatDateVN(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
    }

    // Format tiền VND gọn: 1500000 → "1.5tr", 500000 → "500k"
    function formatVND(amount: number): string {
      if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}tr`;
        if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
          return `${amount}đ`;
          }
          ```

          ---

          ## BƯỚC 2 — Thêm 3 handler functions

          Thêm sau function `handleDayView` (trước `serve(async (req) =>`):

          ```typescript
          // ─── /checkin — Danh sách check-in hôm nay ───────────────────────────────
          async function handleCheckinList(
            chatId: number,
              supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
              ) {
                const today = todayICT();

                  const { data, error } = await supabase
                      .from("bookings")
                          .select("room_id, guest_name, check_in, check_out, booking_status, nights, grand_total, groups(paid)")
                              .eq("check_in", today)
                                  .in("booking_status", ["booked", "checked-in"])
                                      .eq("is_deleted", false)
                                          .order("room_id");

                                            if (error) {
                                                await sendMessage(chatId, "❌ Lỗi truy vấn. Thử lại nhé.");
                                                    return;
                                                      }

                                                        if (!data || data.length === 0) {
                                                            await sendMessage(chatId, `🛬 <b>Check-in hôm nay (${formatDateVN(today)})</b>\n\n✅ Không có khách check-in.`);
                                                                return;
                                                                  }

                                                                    const lines: string[] = [`🛬 <b>Check-in hôm nay (${formatDateVN(today)})</b>\n`];

                                                                      for (const b of data) {
                                                                          const paid = (b.groups as { paid?: number } | null)?.paid ?? 0;
                                                                              const debt = (b.grand_total ?? 0) - paid;
                                                                                  const statusIcon = b.booking_status === "checked-in" ? "✅" : "⏳";
                                                                                      const debtStr = debt > 0 ? ` | 💰 Còn nợ: ${formatVND(debt)}` : " | ✅ Đã trả đủ";

                                                                                          lines.push(
                                                                                                `${statusIcon} <b>Phòng ${b.room_id}</b> — ${b.guest_name}\n` +
                                                                                                      `   📆 ${formatDateVN(b.check_in)} → ${formatDateVN(b.check_out)} (${b.nights} đêm)${debtStr}`,
                                                                                                          );
                                                                                                            }

                                                                                                              await sendMessage(chatId, lines.join("\n"));
                                                                                                              }

                                                                                                              // ─── /checkout — Danh sách check-out hôm nay ─────────────────────────────
                                                                                                              async function handleCheckoutList(
                                                                                                                chatId: number,
                                                                                                                  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
                                                                                                                  ) {
                                                                                                                    const today = todayICT();

                                                                                                                      const { data, error } = await supabase
                                                                                                                          .from("bookings")
                                                                                                                              .select("room_id, guest_name, check_in, check_out, booking_status, nights, grand_total, groups(paid)")
                                                                                                                                  .eq("check_out", today)
                                                                                                                                      .eq("booking_status", "checked-in")
                                                                                                                                          .eq("is_deleted", false)
                                                                                                                                              .order("room_id");

                                                                                                                                                if (error) {
                                                                                                                                                    await sendMessage(chatId, "❌ Lỗi truy vấn. Thử lại nhé.");
                                                                                                                                                        return;
                                                                                                                                                          }

                                                                                                                                                            if (!data || data.length === 0) {
                                                                                                                                                                await sendMessage(chatId, `🛫 <b>Check-out hôm nay (${formatDateVN(today)})</b>\n\n✅ Không có khách check-out.`);
                                                                                                                                                                    return;
                                                                                                                                                                      }

                                                                                                                                                                        const lines: string[] = [`🛫 <b>Check-out hôm nay (${formatDateVN(today)})</b>\n`];

                                                                                                                                                                          for (const b of data) {
                                                                                                                                                                              const paid = (b.groups as { paid?: number } | null)?.paid ?? 0;
                                                                                                                                                                                  const debt = (b.grand_total ?? 0) - paid;
                                                                                                                                                                                      const debtStr = debt > 0
                                                                                                                                                                                            ? ` | ⚠️ Còn nợ: ${formatVND(debt)}`
                                                                                                                                                                                                  : " | ✅ Đã trả đủ";

                                                                                                                                                                                                      lines.push(
                                                                                                                                                                                                            `🚪 <b>Phòng ${b.room_id}</b> — ${b.guest_name}\n` +
                                                                                                                                                                                                                  `   📆 ${formatDateVN(b.check_in)} → ${formatDateVN(b.check_out)} (${b.nights} đêm)${debtStr}`,
                                                                                                                                                                                                                      );
                                                                                                                                                                                                                        }

                                                                                                                                                                                                                          await sendMessage(chatId, lines.join("\n"));
                                                                                                                                                                                                                          }

                                                                                                                                                                                                                          // ─── /stay — Tất cả khách đang ở hiện tại ────────────────────────────────
                                                                                                                                                                                                                          async function handleStay(
                                                                                                                                                                                                                            chatId: number,
                                                                                                                                                                                                                              supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
                                                                                                                                                                                                                              ) {
                                                                                                                                                                                                                                const today = todayICT();

                                                                                                                                                                                                                                  const { data, error } = await supabase
                                                                                                                                                                                                                                      .from("bookings")
                                                                                                                                                                                                                                          .select("room_id, guest_name, check_in, check_out, nights, grand_total, groups(paid)")
                                                                                                                                                                                                                                              .eq("booking_status", "checked-in")
                                                                                                                                                                                                                                                  .eq("is_deleted", false)
                                                                                                                                                                                                                                                      .order("room_id");

                                                                                                                                                                                                                                                        if (error) {
                                                                                                                                                                                                                                                            await sendMessage(chatId, "❌ Lỗi truy vấn. Thử lại nhé.");
                                                                                                                                                                                                                                                                return;
                                                                                                                                                                                                                                                                  }

                                                                                                                                                                                                                                                                    if (!data || data.length === 0) {
                                                                                                                                                                                                                                                                        await sendMessage(chatId, "🏨 <b>Khách đang ở</b>\n\n✅ Hiện không có khách nào.");
                                                                                                                                                                                                                                                                            return;
                                                                                                                                                                                                                                                                              }

                                                                                                                                                                                                                                                                                const lines: string[] = [`🏨 <b>Khách đang ở (${formatDateVN(today)})</b>\n`];

                                                                                                                                                                                                                                                                                  for (const b of data) {
                                                                                                                                                                                                                                                                                      const paid = (b.groups as { paid?: number } | null)?.paid ?? 0;
                                                                                                                                                                                                                                                                                          const debt = (b.grand_total ?? 0) - paid;
                                                                                                                                                                                                                                                                                              const debtStr = debt > 0 ? ` | ⚠️ Nợ ${formatVND(debt)}` : "";

                                                                                                                                                                                                                                                                                                  // Tính số đêm còn lại
                                                                                                                                                                                                                                                                                                      const msLeft = new Date(b.check_out).getTime() - new Date(today).getTime();
                                                                                                                                                                                                                                                                                                          const nightsLeft = Math.round(msLeft / 86400000);
                                                                                                                                                                                                                                                                                                              const nightsLeftStr = nightsLeft === 0
                                                                                                                                                                                                                                                                                                                    ? " <b>→ Ra hôm nay!</b>"
                                                                                                                                                                                                                                                                                                                          : nightsLeft === 1
                                                                                                                                                                                                                                                                                                                                ? " (còn 1 đêm)"
                                                                                                                                                                                                                                                                                                                                      : ` (còn ${nightsLeft} đêm)`;

                                                                                                                                                                                                                                                                                                                                          lines.push(
                                                                                                                                                                                                                                                                                                                                                `🛏 <b>Phòng ${b.room_id}</b> — ${b.guest_name}\n` +
                                                                                                                                                                                                                                                                                                                                                      `   📆 Ra ngày ${formatDateVN(b.check_out)}${nightsLeftStr}${debtStr}`,
                                                                                                                                                                                                                                                                                                                                                          );
                                                                                                                                                                                                                                                                                                                                                            }

                                                                                                                                                                                                                                                                                                                                                              await sendMessage(chatId, lines.join("\n"));
                                                                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                                                                              ```

                                                                                                                                                                                                                                                                                                                                                              ---

                                                                                                                                                                                                                                                                                                                                                              ## BƯỚC 3 — Thêm route dispatch trong `serve(async (req) => {...})`

                                                                                                                                                                                                                                                                                                                                                              Tìm block `// ── /today ──` và thêm ngay SAU nó (sau `return new Response("OK", ...)`):

                                                                                                                                                                                                                                                                                                                                                              ```typescript
                                                                                                                                                                                                                                                                                                                                                                // ── /checkin ──
                                                                                                                                                                                                                                                                                                                                                                  if (text === "/checkin") {
                                                                                                                                                                                                                                                                                                                                                                      await handleCheckinList(chatId, supabase);
                                                                                                                                                                                                                                                                                                                                                                          return new Response("OK", { status: 200 });
                                                                                                                                                                                                                                                                                                                                                                            }

                                                                                                                                                                                                                                                                                                                                                                              // ── /checkout ──
                                                                                                                                                                                                                                                                                                                                                                                if (text === "/checkout") {
                                                                                                                                                                                                                                                                                                                                                                                    await handleCheckoutList(chatId, supabase);
                                                                                                                                                                                                                                                                                                                                                                                        return new Response("OK", { status: 200 });
                                                                                                                                                                                                                                                                                                                                                                                          }

                                                                                                                                                                                                                                                                                                                                                                                            // ── /stay ──
                                                                                                                                                                                                                                                                                                                                                                                              if (text === "/stay") {
                                                                                                                                                                                                                                                                                                                                                                                                  await handleStay(chatId, supabase);
                                                                                                                                                                                                                                                                                                                                                                                                      return new Response("OK", { status: 200 });
                                                                                                                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                                                                                                                        ```

                                                                                                                                                                                                                                                                                                                                                                                                        ---

                                                                                                                                                                                                                                                                                                                                                                                                        ## BƯỚC 4 — Cập nhật `/help`

                                                                                                                                                                                                                                                                                                                                                                                                        Tìm đoạn `<b>📅 Lịch & phòng</b>` trong block `/help`, thêm 3 dòng mới vào cuối nhóm đó:

                                                                                                                                                                                                                                                                                                                                                                                                        ```typescript
                                                                                                                                                                                                                                                                                                                                                                                                              `• <code>/checkin</code> — check-in hôm nay\n` +
                                                                                                                                                                                                                                                                                                                                                                                                                    `• <code>/checkout</code> — check-out hôm nay\n` +
                                                                                                                                                                                                                                                                                                                                                                                                                          `• <code>/stay</code> — khách đang ở hiện tại\n` +
                                                                                                                                                                                                                                                                                                                                                                                                                          ```

                                                                                                                                                                                                                                                                                                                                                                                                                          ---

                                                                                                                                                                                                                                                                                                                                                                                                                          ## BƯỚC 5 — Deploy

                                                                                                                                                                                                                                                                                                                                                                                                                          ```bash
                                                                                                                                                                                                                                                                                                                                                                                                                          supabase functions deploy telegram-webhook
                                                                                                                                                                                                                                                                                                                                                                                                                          ```

                                                                                                                                                                                                                                                                                                                                                                                                                          ---

                                                                                                                                                                                                                                                                                                                                                                                                                          ## Kiểm tra sau deploy

                                                                                                                                                                                                                                                                                                                                                                                                                          Gửi lần lượt vào group Telegram:
                                                                                                                                                                                                                                                                                                                                                                                                                          - `/stay` → phải thấy danh sách phòng đang checked-in
                                                                                                                                                                                                                                                                                                                                                                                                                          - `/checkin` → danh sách check-in hôm nay
                                                                                                                                                                                                                                                                                                                                                                                                                          - `/checkout` → danh sách check-out hôm nay
                                                                                                                                                                                                                                                                                                                                                                                                                          - `/help` → phải thấy 3 lệnh mới trong danh sách

                                                                                                                                                                                                                                                                                                                                                                                                                          ## Không được thay đổi
                                                                                                                                                                                                                                                                                                                                                                                                                          - Logic các lệnh cũ: `/today`, `/next`, `/a`, `/task`, `/tasks`, `/done`, `/skip`, `/extend`
                                                                                                                                                                                                                                                                                                                                                                                                                          - Cấu trúc `serve()`, auth check `ALLOWED_CHAT_ID`, `sendMessage()`
                                                                                                                                                                                                                                                                                                                                                                                                                          - Import và env vars hiện có