"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, MonitorDown, MoreVertical, Share2, ShieldCheck, Smartphone } from "lucide-react";
import { registerStaffServiceWorker } from "@/lib/staff-pwa-client";

export type InstallPlatform = "android" | "ios" | "windows";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function detectedPlatform(): InstallPlatform {
  const ipadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) || ipadDesktopMode) return "ios";
  if (/windows/i.test(navigator.userAgent)) return "windows";
  return "android";
}

const platformCopy: Record<InstallPlatform, { eyebrow: string; title: string; intro: string }> = {
  android: {
    eyebrow: "ANDROID PRIVATE INSTALL",
    title: "ثبّت MJ على أندرويد",
    intro: "سيظهر MJ في الشاشة الرئيسية ويفتح كتطبيق مستقل بلا شريط المتصفح.",
  },
  ios: {
    eyebrow: "IPHONE · IPAD PRIVATE INSTALL",
    title: "ثبّت MJ على iPhone أو iPad",
    intro: "أكمل الإضافة من Safari ثم افتح MJ من أيقونته، وليس من رابط المتصفح.",
  },
  windows: {
    eyebrow: "WINDOWS RECEPTION INSTALL",
    title: "ثبّت MJ على كمبيوتر الاستقبال",
    intro: "سيعمل MJ في نافذة تطبيق مستقلة ويمكن فتحه من Start أو اختصار سطح المكتب.",
  },
};

export default function StaffInstaller({ platformHint }: { platformHint: InstallPlatform }) {
  const [platform, setPlatform] = useState<InstallPlatform>(platformHint);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [state, setState] = useState<"preparing" | "ready" | "manual" | "installed" | "error">("preparing");

  useEffect(() => {
    if (standaloneMode()) {
      window.location.replace("/staff");
      return;
    }
    const platformTimer = window.setTimeout(() => setPlatform(detectedPlatform()), 0);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
      setState("ready");
    };
    const onInstalled = () => {
      setPrompt(null);
      setState("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    void registerStaffServiceWorker()
      .then(() => setState((current) => current === "preparing" ? "manual" : current))
      .catch(() => setState("error"));
    return () => {
      window.clearTimeout(platformTimer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return setState("manual");
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    setState(choice.outcome === "accepted" ? "installed" : "manual");
  };

  const content = platformCopy[platform];
  return (
    <main className="mj-installer-page" dir="rtl">
      <div className="mj-installer-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <section className="mj-installer-card">
        <header>
          <img src="/assets/mj-control-192.png" alt="MJ Team" />
          <span><b>MJ</b><small>TEAM APP</small></span>
        </header>
        <p className="mj-installer-kicker">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="mj-installer-copy">{content.intro}</p>

        {state === "installed" ? (
          <div className="mj-install-success">
            <CheckCircle2 size={34} />
            <div><strong>تم تثبيت MJ بنجاح</strong><span>أغلق المتصفح وافتح التطبيق من أيقونة MJ.</span></div>
          </div>
        ) : platform === "ios" ? (
          <ol className="mj-installer-steps">
            <li><Share2 size={21} /><span><b>1</b> افتح الرابط في <strong>Safari</strong> واضغط المشاركة.</span></li>
            <li><Download size={21} /><span><b>2</b> اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.</span></li>
            <li><ShieldCheck size={21} /><span><b>3</b> فعّل <strong>فتح كتطبيق ويب</strong> ثم اضغط إضافة.</span></li>
            <li><Smartphone size={21} /><span><b>4</b> افتح MJ من الأيقونة الجديدة فقط.</span></li>
          </ol>
        ) : platform === "windows" ? (
          <>
            <ol className="mj-installer-steps">
              <li><MonitorDown size={21} /><span><b>1</b> افتح الرابط في <strong>Microsoft Edge</strong> أو Chrome.</span></li>
              <li><Download size={21} /><span><b>2</b> اضغط تثبيت التطبيق ووافق على إنشاء الاختصار.</span></li>
              <li><ShieldCheck size={21} /><span><b>3</b> افتح MJ من Start أو سطح المكتب.</span></li>
            </ol>
            <button className="mj-installer-action" type="button" disabled={state === "preparing"} onClick={() => void install()}><MonitorDown size={20} />{prompt ? "تثبيت MJ على ويندوز" : "استخدم زر التثبيت في Edge"}</button>
          </>
        ) : (
          <>
            <ol className="mj-installer-steps">
              <li><MoreVertical size={21} /><span><b>1</b> افتح الرابط في <strong>Chrome</strong>.</span></li>
              <li><Download size={21} /><span><b>2</b> اضغط تثبيت التطبيق ووافق على رسالة النظام.</span></li>
              <li><Smartphone size={21} /><span><b>3</b> افتح MJ من أيقونة الشاشة الرئيسية.</span></li>
            </ol>
            <button className="mj-installer-action" type="button" disabled={state === "preparing"} onClick={() => void install()}><Download size={20} />{prompt ? "تثبيت MJ الآن" : "استخدم تثبيت التطبيق من Chrome"}</button>
          </>
        )}

        {state === "error" && <p className="mj-installer-error">تعذر تجهيز التثبيت. افتح الرابط من Safari أو Chrome أو Edge مباشرة.</p>}
        <footer><ShieldCheck size={18} /><span>هذا رابط تثبيت إداري خاص. تسجيل الدخول محجوب داخل المتصفح.</span></footer>
      </section>
    </main>
  );
}
