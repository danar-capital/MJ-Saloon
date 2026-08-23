declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET: R2Bucket;
    WHATSAPP_PHONE_NUMBER_ID?: string;
    WHATSAPP_ACCESS_TOKEN?: string;
    WHATSAPP_AUTH_TEMPLATE?: string;
    WHATSAPP_CUSTOMER_TEMPLATE?: string;
    WHATSAPP_OWNER_TEMPLATE?: string;
    WHATSAPP_STAFF_TEMPLATE?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
    STAFF_INSTALL_TOKEN?: string;
  }
}
