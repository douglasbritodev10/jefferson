import { app } from './firebase-config.js';
import { 
    getFirestore, collection, getDocs, query, orderBy, where 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const db = getFirestore(app);
const auth = getAuth(app);

// Armazena em memória local apenas o lote baixado sob demanda
let logsDoPeriodo = [];

// --- 1. CONTROLE DE SESSÃO ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    // Exibe o login do operador na barra ao lado da seta
    const username = localStorage.getItem('username') || "USUÁRIO";
    document.getElementById('userNameDisplay').innerText = username.toUpperCase();
});

// Evento do botão Sair (canto superior direito)
document.getElementById('btnSair').addEventListener('click', () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "index.html";
    });
});

// --- 2. CONSULTA OTIMIZADA SOB DEMANDA ---
async function consultarHistoricoNoBanco() {
    const dtInicialRaw = document.getElementById('dataInicial').value;
    const dtFinalRaw = document.getElementById('dataFinal').value;
    const tbody = document.getElementById('corpoHistorico');

    // Validação de segurança: Exige as duas datas para não estourar o limite de leitura do Firestore
    if (!dtInicialRaw || !dtFinalRaw) {
        alert("Por favor, selecione as duas datas (Inicial e Final) para realizar a consulta.");
        return;
    }

    if (dtInicialRaw > dtFinalRaw) {
        alert("A data inicial não pode ser maior que a data final.");
        return;
    }

    // Feedback visual de carregamento
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 25px;"><i class="fas fa-spinner fa-spin"></i> Consultando registros no período...</td></tr>`;

    try {
        // CORREÇÃO: Converte as strings de data do HTML para objetos Date respeitando o fuso horário local,
        // gerando objetos Date nativos do JS que o SDK do Firestore converte perfeitamente para comparar com ServerTimestamp
        const dataInicioObj = new Date(dtInicialRaw + "T00:00:00");
        const dataFimObj = new Date(dtFinalRaw + "T23:59:59");

        const colRef = collection(db, "historico");
        
        // ECONOMIA DE DADOS EXTREMA
        const q = query(
            colRef,
            where("dataHora", ">=", dataInicioObj),
            where("dataHora", "<=", dataFimObj),
            orderBy("dataHora", "desc")
        );

        const querySnapshot = await getDocs(q);
        logsDoPeriodo = [];

        querySnapshot.forEach((docSnap) => {
            logsDoPeriodo.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Aplica a renderização e o filtro de busca textual secundário
        filtrarTextoERenderizar();

    } catch (error) {
        console.error("Erro detalhado ao processar consulta:", error);
        
        // CORREÇÃO DE AUXÍLIO: O erro do console vai te dar um LINK direto se o índice composto estiver faltando!
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: #D32F2F; font-weight: bold; padding: 25px;">
                    Erro ao ler o Firestore. Verifique o console do navegador (F12) para habilitar o índice composto requerido.
                </td>
            </tr>`;
    }
}

// --- 3. FILTRAGEM LOCAL TEXTUAL + MONTAGEM DA TABELA ---
function filtrarTextoERenderizar() {
    const tbody = document.getElementById('corpoHistorico');
    const termoBusca = document.getElementById('inputBuscaGeral').value.toLowerCase().trim();

    // Filtra dentro do lote que já foi baixado pelo período
    const dadosFinais = logsDoPeriodo.filter(log => {
        const usuario = (log.usuario || "").toLowerCase();
        const acao = (log.acao || "").toLowerCase();
        const senha = (log.senha || "").toLowerCase();

        return !termoBusca || usuario.includes(termoBusca) || acao.includes(termoBusca) || senha.includes(termoBusca);
    });

    if (dadosFinais.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #666; padding: 25px;">Nenhum registro encontrado para este período/busca.</td></tr>`;
        return;
    }

    let html = "";
    dadosFinais.forEach(log => {
        // CORREÇÃO: Tratamento para ler o Timestamp nativo do Firebase e convertê-lo para formato brasileiro
        let dataExibicao = "---";
        if (log.dataHora) {
            // Se vier do Firebase como objeto Timestamp, possui o método .toDate()
            const dataObj = typeof log.dataHora.toDate === 'function' ? log.dataHora.toDate() : new Date(log.dataHora);
            dataExibicao = dataObj.toLocaleString('pt-BR');
        }

        // Estilização dinâmica da Ação usando badges compactas
        const acaoTexto = log.acao || "AÇÃO";
        let classeBadge = "badge-padrao";
        
        if (acaoTexto.includes("ADICIONADO") || acaoTexto.includes("SALVAR") || acaoTexto.includes("CADASTRO")) {
            classeBadge = "badge-sucesso";
        } else if (acaoTexto.includes("EXCLUIR") || acaoTexto.includes("REMOVER") || acaoTexto.includes("CANCELADO")) {
            classeBadge = "badge-perigo";
        } else if (acaoTexto.includes("ALTERACAO") || acaoTexto.includes("EDITADO") || acaoTexto.includes("AJUSTE")) {
            classeBadge = "badge-aviso";
        }

        html += `
            <tr>
                <td><i class="far fa-clock" style="color:#aaa; margin-right:4px;"></i> <b>${dataExibicao}</b></td>
                <td><i class="far fa-user" style="color:#777; margin-right:4px;"></i> ${log.usuario || "SISTEMA"}</td>
                <td><span class="badge-acao ${classeBadge}">${acaoTexto}</span></td>
                <td><code style="background:#f5f5f5; padding:2px 6px; border-radius:4px; font-weight:700; color:#c00000;">${log.senha || "N/A"}</code></td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// --- 4. ASSOCIAÇÃO DOS GATILHOS DE EVENTOS ---
document.getElementById('btnFiltrarBanco').addEventListener('click', consultarHistoricoNoBanco);

// A busca geral funciona instantaneamente por digitação, mas opera em cima do lote de período já carregado
document.getElementById('inputBuscaGeral').addEventListener('input', filtrarTextoERenderizar);
