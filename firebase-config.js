// firebase-config.js - Firebase Realtime Database Configuration

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC2wWnm0iUkXRBYeIEBAlag56S_tUPQI_U",
  authDomain: "tennis-44774.firebaseapp.com",
  projectId: "tennis-44774",
  storageBucket: "tennis-44774.firebasestorage.app",
  messagingSenderId: "254814527272",
  appId: "1:254814527272:web:4523c734c70971abd4ba1d",
  measurementId: "G-RWJ8X1EMCN",
  // 自動補上的 databaseURL (如果您建立時選亞洲就是這段，如果選美國則為 https://tennis-44774-default-rtdb.firebaseio.com)
  databaseURL: "https://tennis-44774-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase
let app;
let db;

try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.error("Firebase initialization failed.", e);
}

export { db, ref, onValue, set };
