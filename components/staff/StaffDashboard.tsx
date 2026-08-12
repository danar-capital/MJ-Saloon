"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, LayoutDashboard, LoaderCircle, LogOut, Scissors, Search, Settings2, UsersRound, X } from "lucide-react";
import { getService, getStaff, minutesToTime } from "@/lib/booking-config";
import Link from "next/link";

type StaffRow = { id: string; name: string; role_ar: string; specialty: string; status: "available" | "off_today" | "disabled"; status_date: string | null };
type ServiceRow = { id: string; category_id: string; name_ar: string; duration_minutes: number; price_ar: string; status: "available" | "off_today" | "disabled"; status_date: string | null };
type BookingRow = { id: string; booking_code: string; first_name: string; last_name: string; phone: string; status: string; created_at: string };
type ItemRow = { id: string; booking_id: string; guest_index: number; guest_label: string; service_id: string; staff_id: string; booking_date: string; start_minute: number; end_minute: number; status: string };
type RequestRow = { id: string; booking_id: string; booking_code: string; first_name: string; last_name: string; phone: string; type: "cancel" | "reschedule"; requested_date: string | null; requested_start_minute: number | null; status: string; created_at: string };
type Dashboard = { staff: StaffRow[]; services: ServiceRow[]; bookings: BookingRow[]; items: ItemRow[]; requests: RequestRow[] };

function ammanToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function shiftDate(date: string, days: number) { const value = new Date(`${date}T00:00:00+03:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); }
function displayDate(date: string) { return new Intl.DateTimeFormat("ar-JO", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Amman" }).format(new Date(`${date}T12:00:00+03:00`)); }

export default function StaffDashboard({ viewer }: { viewer: { name: string; email: string; isOwner: boolean } }) {
  const [data, setData] = useState<Dashboard>({ staff: [], services: [], bookings: [], items: [], requests: [] });
  const [tab, setTab] = useState<"schedule" | "requests" | "availability">("schedule");
  const [date, setDate] = useState(ammanToday());
  const [selectedStaff, setSelectedStaff] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/staff/dashboard", { cache: "no-store" });
      const payload = await response.json() as Dashboard & { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setData(payload);
    } catch { setError("تعذر تحميل لوحة المواعيد."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // Initial dashboard load only.
  }, []);

  const dayItems = useMemo(() => data.items.filter((item) => item.booking_date === date && item.status === "confirmed" && (selectedStaff === "all" || item.staff_id === selectedStaff)).filter((item) => {
    if (!query.trim()) return true;
    const booking = data.bookings.find((entry) => entry.id === item.booking_id);
    return `${booking?.first_name} ${booking?.last_name} ${booking?.phone} ${booking?.booking_code}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => a.start_minute - b.start_minute), [data, date, selectedStaff, query]);
  const pending = data.requests.filter((request) => request.status === "pending");
  const activeStaff = data.staff.filter((member) => member.status === "available").length;

  const updateStatus = async (target: "staff" | "service", id: string, status: StaffRow["status"]) => {
    setError("");
    const response = await fetch("/api/staff/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, id, status }) });
    if (!response.ok) return setError("تعذر تغيير الحالة.");
    await load();
  };

  const decide = async (requestId: string, decision: "approve" | "reject") => {
    const response = await fetch("/api/staff/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, decision }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setError(payload.error === "SLOT_UNAVAILABLE" ? "الوقت المطلوب لم يعد متاحًا. اختروا وقتًا بديلًا مع العميل." : "تعذر اعتماد الطلب.");
    await load();
  };

  return (
    <main className="staff-page" dir="rtl">
      <aside className="staff-sidebar">
        <Link href="/" className="staff-logo"><img src="/assets/mj-logo.svg" alt="MJ" /><span>MJ CONTROL</span></Link>
        <nav><button className={tab === "schedule" ? "active" : ""} onClick={() => setTab("schedule")}><CalendarDays size={19} />المواعيد اليومية</button>{viewer.isOwner && <button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}><LayoutDashboard size={19} />طلبات التعديل {pending.length > 0 && <b>{pending.length}</b>}</button>}{viewer.isOwner && <button className={tab === "availability" ? "active" : ""} onClick={() => setTab("availability")}><Settings2 size={19} />التوفر والخدمات</button>}</nav>
        <div className="staff-user"><span>{viewer.name.slice(0, 1).toUpperCase()}</span><div><strong>{viewer.name}</strong><small>{viewer.isOwner ? "المالك · كامل الصلاحيات" : "حساب موظف"}</small></div></div>
        <a className="staff-signout" href="/signout-with-chatgpt?return_to=/"><LogOut size={17} />تسجيل الخروج</a>
      </aside>
      <section className="staff-workspace">
        <header className="staff-top"><div><p>MJ OPERATIONS</p><h1>{tab === "schedule" ? "المواعيد" : tab === "requests" ? "طلبات العملاء" : "إدارة التوفر"}</h1></div><div className="staff-metrics"><span><b>{dayItems.length}</b><small>موعد اليوم المختار</small></span><span><b>{activeStaff}</b><small>متاحون الآن</small></span><span><b>{pending.length}</b><small>بانتظار القرار</small></span></div></header>
        {error && <div className="booking-error">{error}</div>}
        {busy ? <div className="staff-loading"><LoaderCircle className="spin" size={34} />جارٍ تحميل نظام MJ…</div> : tab === "schedule" ? <>
          <div className="schedule-toolbar"><div className="date-switch"><button onClick={() => setDate(shiftDate(date, -1))}><ChevronRight size={18} /></button><div><strong>{displayDate(date)}</strong><small>{date}</small></div><button onClick={() => setDate(shiftDate(date, 1))}><ChevronLeft size={18} /></button></div><select value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)}><option value="all">جميع المختصين</option>{data.staff.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select><label className="dashboard-search"><Search size={17} /><input placeholder="ابحث بالاسم، الرقم أو رقم الحجز" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
          <div className="day-agenda">{dayItems.length ? dayItems.map((item) => { const booking = data.bookings.find((entry) => entry.id === item.booking_id); const member = getStaff(item.staff_id); const service = getService(item.service_id); return <article className="agenda-item" key={item.id}><time><strong>{minutesToTime(item.start_minute, "ar")}</strong><small>{minutesToTime(item.end_minute, "ar")}</small></time><span className="agenda-line" /><div className="agenda-main"><div className="agenda-avatar">{member?.image ? <img src={member.image} alt="" /> : member?.name.slice(0, 2)}</div><div><p>{member?.name}</p><h2>{booking?.first_name} {booking?.last_name}</h2><span>{service?.name.ar} · {item.guest_label || `الشخص ${item.guest_index + 1}`}</span></div></div><div className="agenda-contact"><strong dir="ltr">+{booking?.phone}</strong><small>{booking?.booking_code}</small></div><span className="status-pill confirmed">مؤكد</span></article>; }) : <div className="agenda-empty"><Scissors size={40} /><h2>لا توجد مواعيد هنا.</h2><p>غيّر التاريخ أو اختر مختصًا آخر.</p></div>}</div>
        </> : tab === "requests" ? <div className="request-board">{pending.length ? pending.map((request) => <article className="request-card" key={request.id}><div className="request-type">{request.type === "cancel" ? <X size={20} /> : <CalendarDays size={20} />}</div><div><p>{request.booking_code}</p><h2>{request.first_name} {request.last_name}</h2><span dir="ltr">+{request.phone}</span></div><div className="request-change"><small>{request.type === "cancel" ? "طلب إلغاء" : "الموعد المطلوب"}</small><strong>{request.type === "cancel" ? "إلغاء الموعد كاملًا" : `${request.requested_date} · ${minutesToTime(request.requested_start_minute ?? 0, "ar")}`}</strong></div><div className="request-actions"><button className="approve" onClick={() => decide(request.id, "approve")}><Check size={17} />اعتماد</button><button onClick={() => decide(request.id, "reject")}><X size={17} />رفض</button></div></article>) : <div className="agenda-empty"><Check size={40} /><h2>كل الطلبات منجزة.</h2><p>لا توجد طلبات تعديل أو إلغاء بانتظار القرار.</p></div>}</div> : <div className="availability-grid"><section><div className="availability-head"><div><p>TEAM STATUS</p><h2>الفريق</h2></div><UsersRound size={24} /></div><div className="status-list">{data.staff.map((member) => <article key={member.id}><div className={`tiny-avatar ${member.status}`}>{getStaff(member.id)?.image ? <img src={getStaff(member.id)?.image} alt="" /> : member.name.slice(0, 2)}</div><div><strong>{member.name}</strong><small>{member.role_ar}</small></div><select value={member.status} onChange={(event) => updateStatus("staff", member.id, event.target.value as StaffRow["status"])}><option value="available">متاح</option><option value="off_today">إجازة اليوم</option><option value="disabled">متوقف حتى التفعيل</option></select></article>)}</div></section><section><div className="availability-head"><div><p>SERVICE STATUS</p><h2>الخدمات</h2></div><Scissors size={24} /></div><div className="status-list service-status">{data.services.map((service) => <article key={service.id}><span className={`service-status-dot ${service.status}`} /><div><strong>{service.name_ar}</strong><small>{service.duration_minutes} دقيقة · {service.price_ar}</small></div><select value={service.status} onChange={(event) => updateStatus("service", service.id, event.target.value as StaffRow["status"])}><option value="available">متاحة</option><option value="off_today">مخفية اليوم</option><option value="disabled">متوقفة حتى التفعيل</option></select></article>)}</div></section></div>}
      </section>
    </main>
  );
}
