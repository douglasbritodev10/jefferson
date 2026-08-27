import { app } from './firebase-config.js';
// ADICIONADO: importação do sendPasswordResetEmail na linha abaixo
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const loginBtn = document.getElementById('btnLogin');
const loginInput = document.getElementById('loginField');
const passInput = document.getElementById('passwordField');

// NOVOS ELEMENTOS CAPTURADOS
const forgotPassBtn = document.getElementById('btnForgotPass');
const pwaBtn = document.getElementById('btnInstallPWA');
let deferredPrompt; 

async function realizarLogin() {
    let usernameOrEmail = loginInput.value.trim();
    const password = passInput.value;

    if (!usernameOrEmail || !password) {
        alert("Por favor, preencha as credenciais.");
        return;
    }

    loginBtn.innerText = "AUTENTICANDO...";
    loginBtn.disabled = true;

    try {
        let emailFinal = usernameOrEmail;

        if (!usernameOrEmail.includes("@")) {
            const q = query(collection(db, "users"), where("username", "==", usernameOrEmail.toUpperCase()));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("Usuário não encontrado.");
            }
            emailFinal = querySnapshot.docs[0].data().email;
        }

        const userCred = await signInWithEmailAndPassword(auth, emailFinal, password);
        const uid = userCred.user.uid;

        const userDoc = await getDoc(doc(db, "users", uid));

        if (userDoc.exists()) {
            const data = userDoc.data();
            localStorage.setItem('nivelAcesso', data.nivelAcesso);
            localStorage.setItem('usuarioNome', data.nome);
            localStorage.setItem('username', data.username);
            localStorage.setItem('usuarioEmail', data.email);
            
            window.location.href = "inicial.html";
        } else {
            window.location.href = "primeiro-acesso.html";
        }

    } catch (error) {
        console.error("Erro no login:", error);
        alert(error.message === "Usuário não encontrado." ? error.message : "E-mail/Usuário ou senha incorretos.");
        loginBtn.innerText = "ENTRAR NO SISTEMA";
        loginBtn.disabled = false;
    }
}

// NOVA FUNÇÃO: Redefinição de senha nativa do Firebase
async function recuperarSenha(e) {
    e.preventDefault();
    const emailOrUser = loginInput.value.trim();

    if (!emailOrUser) {
        alert("Por favor, digite seu e-mail no campo 'E-mail ou Usuário' para recuperar a senha.");
        loginInput.focus();
        return;
    }

    // Caso o usuário tenha digitado apenas o username corporativo, tentamos buscar o e-mail associado no Firestore
    let emailFinal = emailOrUser;
    
    if (!emailOrUser.includes("@")) {
        try {
            const q = query(collection(db, "users"), where("username", "==", emailOrUser.toUpperCase()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                alert("Usuário não encontrado para recuperação.");
                return;
            }
            emailFinal = querySnapshot.docs[0].data().email;
        } catch (err) {
            console.error(err);
            alert("Erro ao buscar usuário.");
            return;
        }
    }

    // Disparando o e-mail oficial do Firebase
    try {
        await sendPasswordResetEmail(auth, emailFinal);
        alert(`E-mail de redefinição enviado com sucesso para: ${emailFinal}\nVerifique sua caixa de entrada ou spam.`);
    } catch (error) {
        console.error("Erro ao enviar e-mail de recuperação:", error);
        alert("Erro ao tentar enviar o e-mail de recuperação. Verifique se o e-mail está correto.");
    }
}

// Evento do botão esqueci a senha
forgotPassBtn.addEventListener('click', recuperarSenha);

// Evento de clique
loginBtn.addEventListener('click', realizarLogin);

// Suporte ao ENTER em ambos os campos
[loginInput, passInput].forEach(field => {
    field.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') realizarLogin();
    });
});

// ==========================================
// LÓGICA DE INSTALAÇÃO DO PWA
// ==========================================
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Exibe o botão customizado se ele existir nesta página
    if (pwaBtn) pwaBtn.style.display = 'block';
});

if (pwaBtn) {
    pwaBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        
        deferredPrompt.prompt();
        
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Resposta do usuário ao prompt de instalação: ${outcome}`);
        
        deferredPrompt = null;
        pwaBtn.style.display = 'none';
    });
}

window.addEventListener('appinstalled', () => {
    console.log('LogPrime instalado com sucesso!');
    if (pwaBtn) pwaBtn.style.display = 'none';
    deferredPrompt = null;
});

// ==========================================
// O QUE ESTAVA FALTANDO: REGISTRO DO SERVICE WORKER
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Aponta para o sw.js que criamos no passo anterior localizado na raiz
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('Service Worker do LogPrime registrado com sucesso no escopo:', reg.scope))
            .catch((err) => console.error('Erro ao registrar o Service Worker:', err));
    });
}
