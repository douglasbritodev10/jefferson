import { app } from './firebase-config.js';
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore, collection, query, getDocs, where } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

// Verificação de Autenticação e Nível de Acesso
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // Carrega dados da sessão (localStorage salvos no login)
    const nome = localStorage.getItem('usuarioNome');
    const username = localStorage.getItem('username');
    
    // Tratamento para garantir que o nível seja lido sem espaços e em letras maiúsculas
    const nivelRaw = localStorage.getItem('nivelAcesso') || "";
    const nivel = nivelRaw.trim().toUpperCase();

    // EXCLUSÃO DE SEGURANÇA: Se não pertencer a nenhum dos 3 níveis válidos, desloga e redireciona
    const niveisPermitidos = ['ADM', 'LOGISTICA', 'LEITOR'];
    if (!niveisPermitidos.includes(nivel)) {
        alert("Nível de acesso inválido ou não identificado. Você será redirecionado.");
        localStorage.clear();
        signOut(auth).then(() => {
            window.location.href = "index.html";
        });
        return;
    }

    document.getElementById('user-display').innerText = username || nome;

    // --- CONTROLE DE VISIBILIDADE DOS CARDS BASEADO NAS CLASSES ---
    
    // 1. Se for ADM, ele tem acesso livre a absolutamente TUDO do painel
    if (nivel === 'ADM') {
        document.querySelectorAll('.acesso-adm, .acesso-logistica, .acesso-leitor').forEach(card => {
            card.style.display = 'flex';
        });
    } 
    // 2. Se for LOGISTICA, vê apenas as suas respectivas ferramentas + as ferramentas de leitura
    else if (nivel === 'LOGISTICA') {
        document.querySelectorAll('.acesso-logistica, .acesso-leitor').forEach(card => {
            card.style.display = 'flex';
        });
    } 
    // 3. Se for LEITOR, vê única e exclusivamente os cards designados para leitura
    else if (nivel === 'LEITOR') {
        document.querySelectorAll('.acesso-leitor').forEach(card => {
            card.style.display = 'flex';
        });
    }

    carregarIndicadores();
});

// Data Atual Formatada
const opcoes = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
document.getElementById('data-atual').innerText = new Date().toLocaleDateString('pt-BR', opcoes);

// Logout
document.getElementById('btnSair').addEventListener('click', () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "index.html";
    });
});

async function carregarIndicadores() {
    try {
        const dataHoje = new Date().toISOString().split('T')[0];
        const q = query(collection(db, "agendamentos"));
        const snap = await getDocs(q);
        
        let total = 0, atrasadas = 0, progresso = 0;

        snap.forEach((doc) => {
            const d = doc.data();
            // Conta cargas de hoje ou que ainda estão pendentes
            if (d.data === dataHoje || d.status !== 'Recebida') {
                total++;
                if (d.status === 'Atrasada') atrasadas++;
                if (d.status === 'Em recebimento') progresso++;
            }
        });

        // Verificação de segurança para não quebrar o código caso os elementos 
        // dos resumos não estejam no HTML atual da sua Home
        const txtTotal = document.getElementById('resumoTotal');
        const txtAtrasadas = document.getElementById('resumoAtrasadas');
        const txtProgresso = document.getElementById('resumoProgresso');

        if(txtTotal) txtTotal.innerText = total;
        if(txtAtrasadas) txtAtrasadas.innerText = atrasadas;
        if(txtProgresso) txtProgresso.innerText = progresso;
        
    } catch (e) {
        console.error("Erro indicadores:", e);
    }
}
