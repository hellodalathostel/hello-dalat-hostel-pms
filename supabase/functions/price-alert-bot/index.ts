import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Room {
	id: string;
	name: string;
	base_price: number;
}

interface ActiveBooking {
	room_id: string;
	price_per_night: number;
	check_in: string;
	check_out: string;
}

interface PriceAlert {
	roomId: string;
	roomName: string;
	date: string;
	currentPrice: number;
	suggestedPrice: number;
	diffPct: number;
	hasBooking: boolean;
}

const SCAN_DAYS = 7;
const ALERT_THRESHOLD_PCT = 10;

function fmtVND(n: number): string {
	return `${(n / 1000).toFixed(0)}k`;
}

function fmtDate(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00+07:00`);
	const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
	const day = days[d.getDay()];
	return `${day} ${String(d.getDate()).padStart(2, "0")}/${String(
		d.getMonth() + 1,
	).padStart(2, "0")}`;
}

function getDateVN(offsetDays: number): string {
	const d = new Date();
	const vnMs = d.getTime() + 7 * 60 * 60 * 1000;
	const vnDate = new Date(vnMs + offsetDays * 24 * 60 * 60 * 1000);
	return vnDate.toISOString().slice(0, 10);
}

Deno.serve(async (_req) => {
	try {
		const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
		const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
		const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
		const chatId = Deno.env.get("TELEGRAM_CHAT_ID")!;

		const supabase = createClient(supabaseUrl, serviceKey);

		const scanStart = getDateVN(1);
		const scanEnd = getDateVN(SCAN_DAYS);

		const { data: rooms, error: roomErr } = await supabase
			.from("rooms")
			.select("id, name, base_price")
			.order("id");
		if (roomErr) throw roomErr;

		const { data: bookings, error: bookErr } = await supabase
			.from("bookings")
			.select("room_id, price_per_night, check_in, check_out")
			.in("status", ["booked", "checked-in"])
			.lt("check_in", scanEnd)
			.gt("check_out", scanStart);
		if (bookErr) throw bookErr;

		const bookingsByRoom: Record<string, ActiveBooking[]> = {};
		for (const b of bookings ?? []) {
			if (!bookingsByRoom[b.room_id]) bookingsByRoom[b.room_id] = [];
			bookingsByRoom[b.room_id].push(b);
		}

		const alerts: PriceAlert[] = [];

		for (let offset = 1; offset <= SCAN_DAYS; offset++) {
			const dateStr = getDateVN(offset);

			for (const room of (rooms as Room[])) {
				const { data: suggested, error: priceErr } = await supabase.rpc(
					"get_suggested_price",
					{ p_room_id: room.id, p_date: dateStr },
				);
				if (priceErr || suggested === null) continue;

				const suggestedPrice = suggested as number;

				const coveringBooking = (bookingsByRoom[room.id] ?? []).find(
					(b) => b.check_in <= dateStr && b.check_out > dateStr,
				);

				if (coveringBooking) {
					const currentPrice = coveringBooking.price_per_night;
					const diffPct = ((suggestedPrice - currentPrice) / currentPrice) * 100;
					if (diffPct >= ALERT_THRESHOLD_PCT) {
						alerts.push({
							roomId: room.id,
							roomName: room.name,
							date: dateStr,
							currentPrice,
							suggestedPrice,
							diffPct,
							hasBooking: true,
						});
					}
				} else {
					const basePrice = room.base_price;
					const diffPct = ((suggestedPrice - basePrice) / basePrice) * 100;
					if (diffPct >= ALERT_THRESHOLD_PCT) {
						alerts.push({
							roomId: room.id,
							roomName: room.name,
							date: dateStr,
							currentPrice: 0,
							suggestedPrice,
							diffPct,
							hasBooking: false,
						});
					}
				}
			}
		}

		if (alerts.length === 0) {
			return new Response(
				JSON.stringify({ sent: false, reason: "Khong co chenh lech gia dang ke" }),
				{ headers: { "Content-Type": "application/json" } },
			);
		}

		const byDate: Record<string, PriceAlert[]> = {};
		for (const a of alerts) {
			if (!byDate[a.date]) byDate[a.date] = [];
			byDate[a.date].push(a);
		}

		let msg = `Canh bao gia - ${SCAN_DAYS} ngay toi\n`;
		msg += `(${fmtDate(scanStart)} -> ${fmtDate(scanEnd)})\n\n`;

		for (const [date, dayAlerts] of Object.entries(byDate).sort()) {
			msg += `${fmtDate(date)}\n`;
			for (const a of dayAlerts) {
				if (a.hasBooking) {
					msg += `  - P${a.roomId} ${a.roomName}: booking ${fmtVND(a.currentPrice)} -> de xuat ${fmtVND(a.suggestedPrice)} (+${a.diffPct.toFixed(0)}%)\n`;
				} else {
					const base = a.suggestedPrice / (1 + a.diffPct / 100);
					msg += `  - P${a.roomId} ${a.roomName}: trong - de xuat ${fmtVND(a.suggestedPrice)} (base ${fmtVND(base)})\n`;
				}
			}
			msg += "\n";
		}
		msg += "Vao PMS cap nhat gia neu can.";

		const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: chatId,
				text: msg,
			}),
		});
		if (!tgRes.ok) throw new Error(`Telegram error: ${await tgRes.text()}`);

		return new Response(
			JSON.stringify({
				sent: true,
				alert_count: alerts.length,
				dates_flagged: Object.keys(byDate).length,
			}),
			{ headers: { "Content-Type": "application/json" } },
		);
	} catch (err) {
		console.error("price-alert-bot error:", err);
		return new Response(JSON.stringify({ error: String(err) }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
});
