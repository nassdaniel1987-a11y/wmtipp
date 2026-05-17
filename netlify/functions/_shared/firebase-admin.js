import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function getServiceAccount() {
  const raw = Netlify.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON.");
  return JSON.parse(raw);
}

export function getFirebaseMessaging() {
  const app = getApps()[0] ?? initializeApp({ credential: cert(getServiceAccount()) });
  return getMessaging(app);
}
