import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCQLI6-YVviG3cS0vbmud4oco8oGV01ySg",
  authDomain: "codecloud-270fe.firebaseapp.com",
  projectId: "codecloud-270fe",
  storageBucket: "codecloud-270fe.firebasestorage.app",
  messagingSenderId: "155488205416",
  appId: "1:155488205416:web:a029e34bb4a3a1a63bd9dd",
  measurementId: "G-L7FDMHKVW2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const loginBtn = document.querySelector('.Login-btn');

onAuthStateChanged(auth, (user) => {
  if (user && loginBtn) {
    loginBtn.textContent = 'Go to console';
    loginBtn.href = 'console.html';
  }
});