import { requireChatGPTUser } from "@/app/chatgpt-auth";
import StaffDashboard from "@/components/staff/StaffDashboard";
import { isOwnerEmail } from "@/lib/staff-auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const user = await requireChatGPTUser("/staff");
  const isOwner = isOwnerEmail(user.email);
  if (!isOwner) {
    return <main className="staff-denied" dir="rtl"><img src="/assets/mj-logo.svg" alt="MJ" /><h1>هذه اللوحة مخصصة لإدارة MJ.</h1><p>اطلب من المالك إضافة حسابك للموظف المناسب قبل تسجيل الدخول.</p><Link href="/">العودة للموقع</Link></main>;
  }
  return <StaffDashboard viewer={{ name: user.displayName, email: user.email, isOwner }} />;
}
