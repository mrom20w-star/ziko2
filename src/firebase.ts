import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getDatabase } from 'firebase/database';

export const firebaseConfig = {
  apiKey: 'AIzaSyAlX1ASvDrf5BBtaB72AUYqSoW34YvP_y4',
  authDomain: 'mrwan-dd795.firebaseapp.com',
  databaseURL: 'https://mrwan-dd795-default-rtdb.firebaseio.com',
  projectId: 'mrwan-dd795',
  storageBucket: 'mrwan-dd795.firebasestorage.app',
  messagingSenderId: '12538399995',
  appId: '1:12538399995:web:4a7e6b40f611891fecb45e',
  measurementId: 'G-KBTHXXDYBL',
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const rtdb = getDatabase(app);

// Safely initialize Analytics in browser environments
export const analyticsPromise =
  typeof window !== 'undefined'
    ? isSupported().then((yes) => (yes ? getAnalytics(app) : null)).catch(() => null)
    : Promise.resolve(null);
