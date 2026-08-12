import { getChatGPTUser } from "@/app/chatgpt-auth";

const ownerEmails = new Set(["danarcapital@gmail.com"]);

export async function assertOwner() {
  const user = await getChatGPTUser();
  if (!user || !ownerEmails.has(user.email.toLowerCase())) throw new Error("STAFF_UNAUTHORIZED");
  return user;
}

export function isOwnerEmail(email: string) {
  return ownerEmails.has(email.toLowerCase());
}
