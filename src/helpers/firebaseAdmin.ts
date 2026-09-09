import admin from "firebase-admin";
import config from "../config";
import logger from "../utils/logger";

if (!admin.apps.length) {
  try {
    const privateKey = config.firebase.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.FIREBASE_PROJECT_ID,
        clientEmail: config.firebase.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
    logger.info("🔥 Firebase Admin SDK initialized successfully.");
  } catch (error) {
    logger.error("❌ Failed to initialize Firebase Admin SDK:", error);
  }
}

export default admin;
