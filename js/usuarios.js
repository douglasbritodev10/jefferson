import { app } from './firebase-config.js';
import { 
    getFirestore, collection, getDocs, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const db = getFirestore(app);

// Controle de Acesso (Apenas ADM)
const nivelLogado = localStorage.getItem('nivelAcesso') || "";
const nomeLogado = localStorage.getItem('username') || "Usuário";
const uidLogado = JSON.parse(localStorage.getItem('usuarioLogado'))?.uid || "";

if (nivelLogado.toUpperCase() !== "ADM") {
    alert("Acesso restrito ao Administrador.");
    window.location.replace("inicial.html");
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('txtUser').innerText = nomeLogado.toUpperCase();
    carregarUsuarios();
});

function carregarUsuarios() {
    const q = query(collection(db, "users"), orderBy("username", "asc"));
    
    onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('tabelaUsers');
        tbody.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const user = docSnap.data();
            const uid = docSnap.id;
            const isAdm = user.nivelAcesso === "ADM";
            
            // Regra: Se o usuário da linha for ADM, desabilita botões (exceto se for o próprio logado para ele ver, mas bloqueamos edição de outros ADMs)
            const bntDisabled = (isAdm && uid !== uidLogado) ? "disabled" : "";
            
            const badgeClass = user.nivelAcesso === "ADM" ? "badge-adm" : (user.nivelAcesso === "LOGISTICA" ? "badge-log" : "badge-lei");

            tbody.innerHTML += `
                <tr>
                    <td><b>${user.username || '---'}</b><br><small>${user.nome || ''}</small></td>
                    <td>${user.email}</td>
                    <td><span class="badge ${badgeClass}">${user.nivelAcesso}</span></td>
                    <td class="actions">
                        <button class="btn-action btn-edit" onclick="abrirEdicao('${uid}', '${user.username}', '${user.nivelAcesso}')" ${bntDisabled}>
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="excluirUsuario('${uid}', '${user.username}')" ${bntDisabled}>
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    });
}

// Funções expostas para o HTML
window.abrirEdicao = (uid, username, nivel) => {
    document.getElementById('editUid').value = uid;
    document.getElementById('editUsername').value = username;
    document.getElementById('editNivel').value = nivel;
    document.getElementById('modalEdit').style.display = 'flex';
};

window.fecharModal = () => {
    document.getElementById('modalEdit').style.display = 'none';
};

window.salvarEdicao = async () => {
    const uid = document.getElementById('editUid').value;
    const novoUser = document.getElementById('editUsername').value.toUpperCase().trim();
    const novoNivel = document.getElementById('editNivel').value;

    if(!novoUser) return alert("Preencha o username");

    try {
        await updateDoc(doc(db, "users", uid), {
            username: novoUser,
            nivelAcesso: novoNivel
        });
        alert("Usuário atualizado!");
        fecharModal();
    } catch (e) {
        console.error(e);
        alert("Erro ao atualizar.");
    }
};

window.excluirUsuario = async (uid, username) => {
    if (uid === uidLogado) return alert("Você não pode excluir sua própria conta.");
    
    if (confirm(`Tem certeza que deseja excluir o usuário ${username}?`)) {
        try {
            await deleteDoc(doc(db, "users", uid));
            alert("Usuário removido.");
        } catch (e) {
            alert("Erro ao excluir.");
        }
    }
};
