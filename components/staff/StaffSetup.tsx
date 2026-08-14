"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function StaffSetup({ ownerName }: { ownerName: string }) {
  const [form, setForm] = useState({ username: "mustafa", password: "", confirm: "", whatsappPhone: "+962796152602" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    if (form.password !== form.confirm) return setError("كلمتا المرور غير متطابقتين.");
    if (form.password.length < 10) return setError("استخدم 10 أحرف على الأقل.");
    setBusy(true);
    try {
      const response = await fetch("/api/staff/bootstrap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setDone(true);
    } catch { setError("تعذر إنشاء الحساب. جرّب اسم مستخدم مختلفًا."); }
    finally { setBusy(false); }
  };

  return <main className="staff-setup-page" dir="rtl"><section className="staff-setup-card"><img src="/assets/mj-logo.svg" alt="MJ" /><p>مرحبًا {ownerName}</p>{done ? <div className="staff-setup-done"><span><Check size={30} /></span><h1>حساب مصطفى جاهز.</h1><p>سجّل الدخول ثم أنشئ حساب كل موظف من قسم الحسابات.</p><Link href="/staff">الذهاب إلى تسجيل الدخول</Link></div> : <><h1>إعداد حساب المدير</h1><p>هذه الخطوة محمية بحساب المالك، ولا تُخزّن كلمة المرور بشكل قابل للقراءة.</p><form onSubmit={submit}><label><span>اسم المستخدم</span><input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} required /></label><label><span>رقم واتساب مصطفى</span><input dir="ltr" value={form.whatsappPhone} onChange={(event) => setForm((current) => ({ ...current, whatsappPhone: event.target.value }))} required /></label><label><span>كلمة المرور الجديدة</span><div className="password-control"><input type={show ? "text" : "password"} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required /><button type="button" onClick={() => setShow((current) => !current)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><label><span>تأكيد كلمة المرور</span><input type="password" value={form.confirm} onChange={(event) => setForm((current) => ({ ...current, confirm: event.target.value }))} required /></label>{error && <div className="staff-login-error">{error}</div>}<button className="staff-login-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <ShieldCheck size={19} />}{busy ? "جارٍ الحفظ…" : "إنشاء الحساب المشفر"}</button></form></>}</section></main>;
}
