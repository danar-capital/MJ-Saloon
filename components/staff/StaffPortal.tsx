"use client";

import { useEffect, useState } from "react";
import { Download, Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import Link from "next/link";
import StaffDashboard from "@/components/staff/StaffDashboard";
import type { StaffViewer } from "@/lib/staff-auth";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function StaffPortal() {
  const [viewer, setViewer] = useState<StaffViewer | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onInstall);
    void fetch("/api/staff/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload: { viewer?: StaffViewer } | null) => setViewer(payload?.viewer ?? null))
      .finally(() => setChecking(false));
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/staff/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
      const payload = await response.json() as { viewer?: StaffViewer; error?: string };
      if (!response.ok || !payload.viewer) throw new Error(payload.error ?? "LOGIN_FAILED");
      setViewer(payload.viewer);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "LOGIN_FAILED";
      setError(message === "ACCOUNT_LOCKED" ? "تم إيقاف المحاولات لمدة 15 دقيقة لحماية الحساب." : "اسم المستخدم أو كلمة المرور غير صحيحة.");
    } finally { setBusy(false); }
  };

  const logout = async () => {
    await fetch("/api/staff/logout", { method: "POST" });
    setViewer(null);
    setCredentials({ username: "", password: "" });
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (checking) return <main className="staff-login-page" dir="rtl"><div className="staff-login-loading"><LoaderCircle className="spin" size={34} /><span>جارٍ تجهيز MJ CONTROL…</span></div></main>;
  if (viewer) return <StaffDashboard viewer={viewer} onLogout={logout} installAvailable={Boolean(installPrompt)} onInstall={install} />;

  return (
    <main className="staff-login-page" dir="rtl">
      <div className="staff-login-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <Link href="/" className="staff-login-home"><img src="/assets/mj-logo.svg" alt="MJ Hair Salon" /><span>العودة للموقع</span></Link>
      <section className="staff-login-card">
        <div className="staff-login-mark"><img src="/assets/mj-logo.svg" alt="MJ" /><span><b>MJ CONTROL</b><small>TEAM OPERATIONS</small></span></div>
        <p className="staff-login-kicker">SECURE TEAM ACCESS</p>
        <h1>مواعيدك.<br />بين يديك.</h1>
        <p className="staff-login-copy">ادخل إلى جدولك، فعّل البريك أو حدّث حالتك من الهاتف أو كمبيوتر الصالون.</p>
        <form onSubmit={login}>
          <label><span>اسم المستخدم</span><input autoComplete="username" value={credentials.username} onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))} required /></label>
          <label><span>كلمة المرور</span><div className="password-control"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          {error && <div className="staff-login-error">{error}</div>}
          <button className="staff-login-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={19} /> : <LogIn size={19} />}{busy ? "جارٍ الدخول…" : "دخول آمن"}</button>
        </form>
        <div className="staff-login-security"><ShieldCheck size={18} /><span>جلسة مشفرة · الحسابات يديرها مصطفى فقط</span></div>
        <Link href="/staff/setup" className="staff-first-setup"><LockKeyhole size={15} />إعداد حساب المدير لأول مرة</Link>
        {installPrompt && <button className="staff-install-login" type="button" onClick={install}><Download size={16} />تثبيت MJ CONTROL كتطبيق</button>}
      </section>
    </main>
  );
}
