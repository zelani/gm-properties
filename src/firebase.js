import { initializeApp }            from "firebase/app";
import { getFirestore }             from "firebase/firestore";
import { getAuth }                  from "firebase/auth";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey:            "AIzaSyAEzox72TcZM0pOZ3nmO_IWrJKhULUGm7I",
  authDomain:        "gm-properties-amir.firebaseapp.com",
  projectId:         "gm-properties-amir",
  storageBucket:     "gm-properties-amir.firebasestorage.app",
  messagingSenderId: "780755949257",
  appId:             "1:780755949257:web:f2c7c57d98bb9c8e5f9f18",
  measurementId:     "G-MHE4Y7Y5PX"
};

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);

// messagingPromise — always resolves, NEVER rejects
// Returns the messaging instance if supported, null otherwise
export const messagingPromise = isSupported()
  .then(yes => {
    if (!yes) return null;
    return getMessaging(app);
  })
  .catch(() => null);  // ← if anything throws, return null gracefully
