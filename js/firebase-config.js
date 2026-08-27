import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
// Adicione estas duas linhas de import abaixo:
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyB8XbEwWWUV8Qm5-TghdTzFGgwHCsouTMI",
    authDomain: "agendamento-ebe81.firebaseapp.com",
    projectId: "agendamento-ebe81",
    storageBucket: "agendamento-ebe81.firebasestorage.app",
    messagingSenderId: "779314983745",
    appId: "1:779314983745:web:2391f6e8f6e663559667c0"
};

const app = initializeApp(firebaseConfig);

// Inicialize e EXPORTE as instâncias aqui:
export const db = getFirestore(app);
export const auth = getAuth(app);
export { app };
