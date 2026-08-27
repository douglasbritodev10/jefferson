import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
// Adicione estas duas linhas de import abaixo:
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCCsGv1dn1mbTfwWbM54ypBiSj9tnfrlH0",
  authDomain: "estoque-600.firebaseapp.com",
  projectId: "estoque-600",
  storageBucket: "estoque-600.firebasestorage.app",
  messagingSenderId: "864906020679",
  appId: "1:864906020679:web:fa6ee3e0514b8824a2ee62"
};

const app = initializeApp(firebaseConfig);

// Inicialize e EXPORTE as instâncias aqui:
export const db = getFirestore(app);
export const auth = getAuth(app);
export { app };
