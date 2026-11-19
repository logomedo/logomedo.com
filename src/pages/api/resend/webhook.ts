import type { APIRoute } from "astro";
import { primiWebhook } from "../../../lib/poruke-webhook";

/** Resend webhook (Svix potpis), samo `email.received`: docs/inbox/, src/lib/poruke-webhook.ts. */
export const POST: APIRoute = ({ request }) => primiWebhook(request);
