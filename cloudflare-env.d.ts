declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    WHATSAPP_PHONE_NUMBER_ID?: string;
    WHATSAPP_ACCESS_TOKEN?: string;
    WHATSAPP_AUTH_TEMPLATE?: string;
    WHATSAPP_CUSTOMER_TEMPLATE?: string;
    WHATSAPP_OWNER_TEMPLATE?: string;
  }
}
