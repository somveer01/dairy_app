import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

// Your web app's Firebase configuration (diaryapp-28278)
export const firebaseConfig = {
  apiKey: "AIzaSyAnDsfVVH1nxGzwNSZrJEDk0ZUko5lG_QY",
  authDomain: "diaryapp-28278.firebaseapp.com",
  databaseURL: "https://diaryapp-28278-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "diaryapp-28278",
  storageBucket: "diaryapp-28278.firebasestorage.app",
  messagingSenderId: "626600523279",
  appId: "1:626600523279:web:dac65b30c890f3576fd57a",
  measurementId: "G-WMCEYR9CXC"
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

export default app;
