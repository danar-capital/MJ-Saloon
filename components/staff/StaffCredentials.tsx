"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import type { StaffViewer } from "@/lib/staff-auth";

export default function StaffCredentials({
  viewer,
  required = false,
  remembered = false,
  onChanged,
}: {
  viewer: StaffViewer;
  required?: boolean;
  remembered?: boolean;
  onChanged: (viewer: StaffViewer) => void;
}) {
  const [form, setForm] = useState({ currentPassword: "", username: viewer.username, newPassword: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (form.newPassword !== form.confirm) return setError("كلمتا المرور الجديدتان غير متطابقتين.");
    if (required && !form.newPassword) return setError("اختر كلمة مرور جديدة قبل المتابعة.");
    setBusy(true);
    try {
      const response = await fetch("/api/staff/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          username: form.username,
          newPassword: form.newPassword || undefined,
          remembered,
        }),
      });
      const payload = await response.json() as { viewer?: StaffViewer; error?: string };
      if (!response.ok || !payload.viewer) throw new Error(payload.error ?? "CREDENTIAL_CHANGE_FAILED");
      onChanged(payload.viewer);
      setForm((current) => ({ ...current, currentPassword: "", newPassword: "", confirm: "", username: payload.viewer!.username }));
      setNotice("تم تحديث بيانات الدخول وتأمين الحساب بنجاح.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "CREDENTIAL_CHANGE_FAILED";
      setError(message === "CURRENT_PASSWORD_INVALID" ? "كلمة المرور الحالية غير صحيحة."
        : message === "USERNAME_TAKEN" ? "اسم المستخدم مستخدم لحساب آخر."
          : message === "INVALID_USERNAME" ? "استخدم 3–32 حرفًا إنجليزيًا أو رقمًا، ويمكن إضافة . _ -"
            : message === "WEAK_PASSWORD" ? "كلمة المرور الجديدة يجب أن تكون 10 أحرف على الأقل."
              : message === "PASSWORD_UNCHANGED" ? "اختر كلمة مرور جديدة مختلفة عن المؤقتة."
                : message === "NEW_PASSWORD_REQUIRED" ? "يجب تغيير كلمة المرور المؤقتة قبل المتابعة."
                  : "تعذر تحديث بيانات الدخول الآن. تأكد من الاتصال وحاول مجددًا.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`mj-credentials-card${required ? " required" : ""}`}>
      <div className="mj-section-title">
        <div>
          <small>{required ? "FIRST SECURE SIGN-IN" : "LOGIN SECURITY"}</small>
          <h2>{required ? "أمّن حسابك قبل المتابعة" : "اسم المستخدم وكلمة المرور"}</h2>
          <p>{required ? "بيانات الدخول التي استلمتها مؤقتة. اختر كلمة مرور جديدة، ويمكنك الاحتفاظ باسم المستخدم أو تغييره." : "يمكنك تغيير اسم المستخدم أو كلمة المرور. نطلب كلمتك الحالية لحماية الحساب."}</p>
        </div>
        <span className="mj-round-icon"><KeyRound size={29} /></span>
      </div>
      <form onSubmit={submit}>
        <label><span>اسم المستخدم الجديد</span><input dir="ltr" autoCapitalize="none" spellCheck={false} autoComplete="username" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} required /></label>
        <label><span>كلمة المرور الحالية</span><div className="mj-password-control"><input type={show ? "text" : "password"} autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))} required /><button type="button" onClick={() => setShow((current) => !current)} aria-label={show ? "إخفاء كلمات المرور" : "إظهار كلمات المرور"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <label><span>{required ? "كلمة المرور الجديدة" : "كلمة مرور جديدة — اختياري"}</span><input type={show ? "text" : "password"} autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))} required={required} placeholder="10 أحرف على الأقل" /></label>
        <label><span>تأكيد كلمة المرور الجديدة</span><input type={show ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={(event) => setForm((current) => ({ ...current, confirm: event.target.value }))} required={Boolean(form.newPassword) || required} /></label>
        {error && <div className="mj-app-alert error">{error}</div>}
        {notice && <div className="mj-app-alert success"><Check size={18} />{notice}</div>}
        <button className="mj-credential-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}{busy ? "جارٍ التأمين…" : required ? "حفظ والدخول إلى التطبيق" : "حفظ بيانات الدخول"}</button>
      </form>
    </section>
  );
}
