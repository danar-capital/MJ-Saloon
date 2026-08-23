import { env } from "cloudflare:workers";

function configuredToken() {
  return (env as unknown as Record<string, string | undefined>).STAFF_INSTALL_TOKEN?.trim() ?? "";
}

export function validStaffInstallToken(supplied: string) {
  const expected = configuredToken();
  if (!expected || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0;
}
