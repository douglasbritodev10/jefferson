import { db, auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    updateDoc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// --- REFERÊNCIAS GLOBAIS ---
const colRef = collection(db, "cooperados");
const histRef = collection(db, "historico");

let cooperadosAtuais = [];
let idEdicao = null;

// --- VERIFICAÇÃO DE USUÁRIO REAL E NÍVEL DE ACESSO ---
onAuthStateChanged(auth, async (user) => {
    const display = document.getElementById('userNameDisplay');
    
    if (user) {
        try {
            // Busca os dados direto na coleção 'users' usando o UID do login
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (userDoc.exists()) {
                const dadosUser = userDoc.data();
                
                // 1. Exibe o nome que está no campo 'username' do documento (conforme solicitado)
                if (display) {
                    display.textContent = (dadosUser.username || "USUÁRIO").toUpperCase();
                }

                // 2. Verifica se o campo 'nivelAcesso' é ADM
                if (dadosUser.nivelAcesso !== 'ADM') {
                    alert("Acesso negado: Nível insuficiente.");
                    window.location.href = 'inicial.html';
                } else {
                    console.log("Acesso ADM confirmado via Firestore.");
                    // Inicia a escuta dos dados apenas se for ADM confirmado
                    ouvirDadosEmTempoReal();
                }
            } else {
                console.error("Usuário não encontrado na coleção 'users'.");
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error("Erro ao verificar nível:", error);
            // Em caso de erro técnico, por segurança, volta para a inicial
            window.location.href = 'inicial.html';
        }
    } else {
        console.log("Nenhum usuário logado.");
        window.location.href = 'index.html';
    }
});

// --- INICIALIZAÇÃO DO DOM ---
document.addEventListener('DOMContentLoaded', () => {
    configurarMascaraCpf();
    // A função ouvirDadosEmTempoReal() agora é chamada dentro do onAuthStateChanged por segurança
});

// --- FUNÇÕES DE DADOS ---

function ouvirDadosEmTempoReal() {
    const q = query(colRef, orderBy("nome", "asc"));
    onSnapshot(q, (snapshot) => {
        cooperadosAtuais = [];
        snapshot.forEach((doc) => {
            cooperadosAtuais.push({ id: doc.id, ...doc.data() });
        });
        renderizarTabela(cooperadosAtuais);
    });
}

function configurarMascaraCpf() {
    const inputCpf = document.getElementById('cpfCooperado');
    if (!inputCpf) return;
    
    inputCpf.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, "");
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length >= 10) {
            v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2}).*/, "$1.$2.$3-$4");
        } else if (v.length >= 7) {
            v = v.replace(/^(\d{3})(\d{3})(\d{1,3}).*/, "$1.$2.$3");
        } else if (v.length >= 4) {
            v = v.replace(/^(\d{3})(\d{1,3}).*/, "$1.$2");
        }
        e.target.value = v;
    });
}

window.salvarCooperado = async function() {
    const nome = document.getElementById('nomeCooperado').value.trim().toUpperCase();
    const cpf = document.getElementById('cpfCooperado').value;
    const btn = document.getElementById('btnSalvar');

    if (nome.length < 5 || cpf.length < 14) {
        alert("Preencha o nome completo e o CPF corretamente.");
        return;
    }

    try {
        btn.disabled = true;
        btn.innerText = "PROCESSANDO...";

        // Pega o nome do usuário que está no display para o histórico
        const usuarioAcao = document.getElementById('userNameDisplay').textContent;

        const dados = {
            nome: nome,
            cpf: cpf,
            ultimaAlteracao: new Date().toISOString(),
            usuarioAcao: usuarioAcao
        };

        if (idEdicao) {
            await updateDoc(doc(db, "cooperados", idEdicao), dados);
            await addDoc(histRef, {
                acao: "EDIÇÃO",
                detalhe: `Cooperado ${nome} atualizado.`,
                usuario: usuarioAcao,
                data: new Date().toISOString()
            });
            idEdicao = null;
        } else {
            dados.dataCadastro = new Date().toISOString();
            await addDoc(colRef, dados);
            await addDoc(histRef, {
                acao: "CADASTRO",
                detalhe: `Novo cooperado: ${nome}`,
                usuario: usuarioAcao,
                data: new Date().toISOString()
            });
        }

        limparCampos();
        alert("Sucesso!");
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i> CADASTRAR COOPERADO';
        btn.style.background = "";
    }
};

window.excluir = async function(id, nome) {
    if (confirm(`Excluir ${nome}?`)) {
        try {
            const usuarioAcao = document.getElementById('userNameDisplay').textContent;
            await deleteDoc(doc(db, "cooperados", id));
            await addDoc(histRef, {
                acao: "EXCLUSÃO",
                detalhe: `Excluiu o cooperado: ${nome}`,
                usuario: usuarioAcao,
                data: new Date().toISOString()
            });
        } catch (error) {
            console.error("Erro ao excluir:", error);
        }
    }
};

window.prepararEdicao = function(id, nome, cpf) {
    idEdicao = id;
    document.getElementById('nomeCooperado').value = nome;
    document.getElementById('cpfCooperado').value = cpf;
    const btn = document.getElementById('btnSalvar');
    btn.innerHTML = '<i class="fas fa-save"></i> SALVAR ALTERAÇÕES';
    btn.style.background = "#1976D2";
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.filtrarTabela = function() {
    const termo = document.getElementById('inputBusca').value.toUpperCase();
    const filtrados = cooperadosAtuais.filter(c => 
        c.nome.includes(termo) || c.cpf.includes(termo)
    );
    renderizarTabela(filtrados);
};

function renderizarTabela(dados) {
    const tbody = document.getElementById('tabelaCooperados');
    if(!tbody) return;
    tbody.innerHTML = dados.map(c => `
        <tr>
            <td data-label="Nome"><b>${c.nome}</b></td>
            <td data-label="CPF">${c.cpf}</td>
            <td class="actions">
                <button class="btn-action btn-edit" onclick="prepararEdicao('${c.id}', '${c.nome}', '${c.cpf}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action btn-delete" onclick="excluir('${c.id}', '${c.nome}')" title="Excluir">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function limparCampos() {
    document.getElementById('nomeCooperado').value = "";
    document.getElementById('cpfCooperado').value = "";
    idEdicao = null;
}
