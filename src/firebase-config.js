import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// TODO: Replace with your actual Firebase project configuration
const firebaseConfig = {

  apiKey: "AIzaSyASOrnDNlg4IPXcA5e37W-spcEnJSNMsKA",

  authDomain: "lightpos-545be.firebaseapp.com",

  projectId: "lightpos-545be",

  storageBucket: "lightpos-545be.firebasestorage.app",

  messagingSenderId: "337504236168",

  appId: "1:337504236168:web:28a7a44f73504d215ea53d"

};



const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db, firebaseConfig };