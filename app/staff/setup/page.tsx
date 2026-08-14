import { requireChatGPTUser } from "@/app/chatgpt-auth";
import StaffSetup from "@/components/staff/StaffSetup";
import { isOwnerEmail } from "@/lib/staff-auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StaffSetupPage() {
  const user = await requireChatGPTUser("/staff/setup");
  if (!isOwnerEmail(user.email)) return <main className="staff-denied" dir="rtl"><h1>غير مصرح.</h1><Link href="/">العودة للموقع</Link></main>;
  return <StaffSetup ownerName={user.displayName} />;
}
