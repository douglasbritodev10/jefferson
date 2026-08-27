import { app } from './firebase-config.js';
import { 
    getFirestore, collection, query, doc, updateDoc, orderBy, addDoc, serverTimestamp, getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const db = getFirestore(app);
const usuarioLogin = localStorage.getItem('username') || "SISTEMA";
let todasAgendasDoBanco = [];
let listaCooperados = [];
let ocultosVisiveis = false;
let idsOcultadosNoFront = [];

let ordemAtual = { coluna: null, direcao: 'asc' };

const situacoesCores = {
    "PENDENTE": '#646464', "CARGA RECEBIDA": '#4CAF50', "NO PATIO - FICOU P/ AMANHÃ": '#3ACFB9', "CANCELADA": '#7a002b',
    "SOB AJUSTE": '#8B27F5', "NO PATIO - SOB ENCAIXE": '#ff7625', "NO PATIO - FICOU DE ONTEM": '#B249BF',
    "EM RECEBIMENTO": '#FFC107', "NO PATIO": '#03A9F4', "EM ATRASO": '#F44336', "REAGENDA": '#9B591B'
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('userNameDisplay').textContent = usuarioLogin;
    carregarDadosIniciais();
    carregarCooperados();
});

// Busca os dados uma única vez ao carregar a página
async function carregarDadosIniciais() {
    const q = query(collection(db, "agendamentos"), orderBy("data", "desc"));
    const snapshot = await getDocs(q);
    todasAgendasDoBanco = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarPainelPrincipal();
}

// Ajuste para carregar como Checkboxes
async function carregarCooperados() {
    const querySnapshot = await getDocs(collection(db, "cooperados"));
    // Mapeia e ordena de A-Z pelo nome
    listaCooperados = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    
    const container = document.getElementById('listaCheckCooperados');
    container.innerHTML = listaCooperados.map(c => `
        <div style="margin-bottom:5px;">
            <label style="cursor:pointer; display:block;">
                <input type="checkbox" class="check-cooperado" value="${c.nome}"> ${c.nome}
            </label>
        </div>`).join('');
}

// Função auxiliar para marcar/desmarcar todos
window.toggleTodosCooperados = (status) => {
    document.querySelectorAll('.check-cooperado').forEach(ck => ck.checked = status);
};

function ouvirDados() {
    const q = query(collection(db, "agendamentos"), orderBy("data", "desc"));
    onSnapshot(q, (snapshot) => {
        todasAgendasDoBanco = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarPainelPrincipal();
    });
}

window.toggleOcultarAgendas = () => {
    const selecionados = Array.from(document.querySelectorAll('.check-export:checked')).map(cb => cb.value);

    if (!ocultosVisiveis) {
        // Modo Normal -> Ocultando o que foi selecionado
        if (selecionados.length === 0) return alert("Selecione quais agendas deseja ocultar!");
        
        idsOcultadosNoFront = [...new Set([...idsOcultadosNoFront, ...selecionados])];
        alert(`${selecionados.length} agendas ocultadas temporariamente.`);
    } else {
        // Modo "Visualizar Ocultos" -> Ao clicar, volta para o painel normal
        ocultosVisiveis = false;
        idsOcultadosNoFront = []; // Limpa a lista de ocultos para voltar ao padrão
    }

    // Resetar o checkbox principal e atualizar tela
    document.getElementById('selectAllPainel').checked = false;
    renderizarPainelPrincipal();
};

window.acaoBotaoOcultar = () => {
    // Aqui dentro o JS consegue ler a variável 'ocultosVisiveis' perfeitamente
    if (ocultosVisiveis) {
        alternarModoVisualizacao();
    } else {
        toggleOcultarAgendas();
    }
};

window.alternarModoVisualizacao = () => {
    ocultosVisiveis = !ocultosVisiveis;
    renderizarPainelPrincipal();
};

function getCorTipo(tp) {
    const t = (tp || "").toUpperCase();
    if (['ROUPEIRO', 'ARMARIO', 'COZINHA', 'PAINEL', 'MODULO', 'MULTIUSO', 'BALCAO', 'COMODA'].some(x => t.includes(x))) return '#FFFF00';
    if (['CELULAR', 'TABLET', 'RELOGIO', 'ROBO', 'NOTEBOOK'].some(x => t.includes(x))) return '#00BFFF';
    if (t.includes('MESA')) return '#4CAF50';
    return 'transparent';
}

function renderizarPainelPrincipal() {
    const tbody = document.getElementById('tabelaCargas');
    const btnOcultar = document.getElementById('btnOcultarPainel');

    let noPainel;
    if (ocultosVisiveis) {
        noPainel = todasAgendasDoBanco.filter(a => a.noPainel === true && idsOcultadosNoFront.includes(a.id));
        if(btnOcultar) btnOcultar.innerHTML = '<i class="fas fa-eye"></i> VER AGENDAS ATIVAS';
    } else {
        noPainel = todasAgendasDoBanco.filter(a => a.noPainel === true && !idsOcultadosNoFront.includes(a.id));
        if(btnOcultar) btnOcultar.innerHTML = '<i class="fas fa-low-vision"></i> OCULTAR AGENDAS';
    }
    
    tbody.innerHTML = noPainel.map(c => {
        const situacaoAtual = c.agendasituacao || 'PENDENTE';

        const options = Object.keys(situacoesCores).map(s => 
            `<option value="${s}" ${situacaoAtual === s ? 'selected' : ''}>${s}</option>`).join('');

        const tipoExibicao = c.tipo || c.tipoProduto || '';
        const infoCarga = c.veiculoAgrupado ? `<br><small style="color:blue;"><b>🚚 ${c.veiculoAgrupado}</b></small>` : '';
        const dataFormatada = c.data ? c.data.split('-').reverse().join('/') : '';

        return `
            <tr>
                <td style="text-align:center;"><input type="checkbox" class="check-export" value="${c.id}"></td>
                <td><b>${c.senhaAgendamento || ''}</b>${infoCarga}</td>
                <td>${dataFormatada}</td>
                <td>${c.central || ''}</td>
                <td style="font-size:10px; max-width:200px;">${c.cargas || ''}</td>
                <td style="width:180px;"> 
                    <select class="select-situacao" onchange="atualizarCampo('${c.id}', 'agendasituacao', this.value)" 
                        style="background:${situacoesCores[situacaoAtual] || '#646464'};">
                        ${options}
                    </select>
                </td>
                <td>${c.fornecedor || ''}</td>
                <td style="background-color:${getCorTipo(tipoExibicao)}; font-weight:bold; text-align:center;">
                    ${tipoExibicao}
                </td>
                <td><input type="text" value="${c.box || ''}" onchange="atualizarCampo('${c.id}', 'box', this.value)" style="width:50px; text-align:center;"></td>
                <td>
                    <div style="display:flex; gap:10px; justify-content:center;">
                        <button onclick="abrirModalAcerto('${c.id}', '${c.senhaAgendamento}', '${c.equipe || ''}', '${c.valorDescarga || ''}')" style="color:#1976D2; border:none; background:none; cursor:pointer;" title="Acerto de Descarga">
                            <i class="fas fa-users-cog fa-lg"></i>
                        </button>
                        <button onclick="verDetalhesComposicao('${c.id}')" style="color:#0A497B; border:none; background:none; cursor:pointer;" title="Ver Composição">
                            <i class="fas fa-eye fa-lg"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    document.getElementById('totalAgendas').textContent = noPainel.length;
    const veiculosUnicos = new Set(noPainel.map(p => p.veiculoAgrupado || p.senhaAgendamento));
    document.getElementById('totalVeiculos').textContent = veiculosUnicos.size;
}

window.ordenarPainel = (coluna) => {
    if (ordemAtual.coluna === coluna) {
        ordemAtual.direcao = ordemAtual.direcao === 'asc' ? 'desc' : 'asc';
    } else {
        ordemAtual.coluna = coluna;
        ordemAtual.direcao = 'asc';
    }

    todasAgendasDoBanco.sort((a, b) => {
        let valA = "";
        let valB = "";

        // Trata o tipo de produto unificando os campos 'tipo' e 'tipoProduto'
        if (coluna === 'tipo' || coluna === 'tipoProduto') {
            valA = (a.tipo || a.tipoProduto || "").toString().toUpperCase();
            valB = (b.tipo || b.tipoProduto || "").toString().toUpperCase();
        } else {
            valA = a[coluna] ? a[coluna].toString().toUpperCase() : "";
            valB = b[coluna] ? b[coluna].toString().toUpperCase() : "";
        }

        if (coluna === 'data') {
            return ordemAtual.direcao === 'asc' 
                ? new Date(a.data) - new Date(b.data)
                : new Date(b.data) - new Date(a.data);
        }

        if (valA < valB) return ordemAtual.direcao === 'asc' ? -1 : 1;
        if (valA > valB) return ordemAtual.direcao === 'asc' ? 1 : -1;
        return 0;
    });

    renderizarPainelPrincipal();
};

// --- LÓGICA DE SELEÇÃO E AÇÕES EM MASSA ---

window.toggleAllPainel = (status) => {
    document.querySelectorAll('.check-export').forEach(ck => ck.checked = status);
};

window.removerSelecionados = async () => {
    const selecionados = Array.from(document.querySelectorAll('.check-export:checked')).map(cb => cb.value);
    if (selecionados.length === 0) return alert("Selecione os itens que deseja remover!");
    
    if (confirm(`Remover ${selecionados.length} agendamentos do painel?`)) {
        for (let id of selecionados) {
            await updateDoc(doc(db, "agendamentos", id), { noPainel: false });
        }
        document.getElementById('selectAllPainel').checked = false;
    }
};

// Função para unir várias agendas em uma "Carga" (Veículo)
window.agruparEmCarga = async () => {
    const selecionados = Array.from(document.querySelectorAll('.check-export:checked')).map(cb => cb.value);
    if (selecionados.length < 2) return alert("Selecione ao menos 2 agendas para unir em uma carga!");

    const identificadorCarga = prompt("Informe uma identificação para este veículo/carga (Ex: PLACA ou NOME DO MOTORISTA):");
    if (!identificadorCarga) return;

    try {
        for (let id of selecionados) {
            await updateDoc(doc(db, "agendamentos", id), { 
                veiculoAgrupado: identificadorCarga.toUpperCase(),
                agendasituacao: "PENDENTE" // Status automático ao identificar veículo
            });
        }
        alert("Agendas unidas com sucesso!");
        document.getElementById('selectAllPainel').checked = false;
    } catch (e) {
        alert("Erro ao agrupar.");
    }
};

window.copiarSelecionados = () => {
    const selecionados = Array.from(document.querySelectorAll('.check-export:checked'));
    if (selecionados.length === 0) return alert("Selecione os agendamentos na tabela!");

    let html = `
        <table style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px; color: #000000; width: auto;">
            <thead>
                <tr>
                    <th style="border: 1px solid #000000; padding: 6px 12px; background-color: #b4c6e7; text-align: center; font-weight: bold;">
                        SENHA
                    </th>
                    <th style="border: 1px solid #000000; padding: 6px 12px; text-align: center; font-weight: bold;">
                        DATA
                    </th>
                    <th style="border: 1px solid #000000; padding: 6px 12px; text-align: center; font-weight: bold;">
                        CENTRAL
                    </th>
                    <th style="border: 1px solid #000000; padding: 6px 12px; text-align: center; font-weight: bold;">
                        CARGA
                    </th>
                </tr>
            </thead>
            <tbody>
    `;

    selecionados.forEach(cb => {
        const tr = cb.closest('tr');
        const senha = tr.cells[1].innerText;
        const data = tr.cells[2].innerText;
        const central = tr.cells[3].innerText;
        const cargas = tr.cells[4].innerText;
        
        html += `
            <tr>
                <td style="border: 1px solid #000000; padding: 6px 12px; background-color: #b4c6e7; text-align: center;">
                    ${senha}
                </td>
                <td style="border: 1px solid #000000; padding: 6px 12px; text-align: center;">
                    ${data}
                </td>
                <td style="border: 1px solid #000000; padding: 6px 12px; text-align: center; text-transform: uppercase;">
                    ${central}
                </td>
                <td style="border: 1px solid #000000; padding: 6px 12px; text-align: center; text-transform: uppercase;">
                    CARGA : ${cargas}
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    const blob = new Blob([html], { type: 'text/html' });
    const clipboardData = [new ClipboardItem({ 'text/html': blob })];
    
    navigator.clipboard.write(clipboardData).then(() => {
        alert("Copiado no formato do e-mail!");
    }).catch(err => {
        console.error("Erro ao copiar: ", err);
    });
};

// --- AJUSTE COMPLETO PARA EXPORTAÇÃO (PDF E EXCEL) ---

// 1. Objeto de Cores Master (Mantenha fora das funções)
const situacoesCoresMaster = {
    "CARGA RECEBIDA": { hex: "4CAF50", rgb: [76, 175, 80], txt: [255, 255, 255] },
    "NO PATIO - FICOU P/ AMANHÃ": { hex: "3ACFB9", rgb: [58, 207, 185], txt: [0, 0, 0] },
    "CANCELADA": { hex: "7A002B", rgb: [122, 0, 43], txt: [255, 255, 255] },
    "SOB AJUSTE": { hex: "8B27F5", rgb: [139, 39, 245], txt: [255, 255, 255] },
    "NO PATIO - SOB ENCAIXE": { hex: "FF7625", rgb: [255, 118, 37], txt: [0, 0, 0] },
    "NO PATIO - FICOU DE ONTEM": { hex: "B249BF", rgb: [178, 73, 191], txt: [255, 255, 255] },
    "EM RECEBIMENTO": { hex: "FFC107", rgb: [255, 193, 7], txt: [0, 0, 0] },
    "NO PATIO": { hex: "03A9F4", rgb: [3, 169, 244], txt: [0, 0, 0] },
    "EM ATRASO": { hex: "F44336", rgb: [244, 67, 54], txt: [255, 255, 255] },
    "REAGENDA": { hex: "9B591B", rgb: [155, 89, 27], txt: [255, 255, 255] },
    "DEFAULT": { hex: "646464", rgb: [100, 100, 100], txt: [255, 255, 255] }
};

// 2. Função de Cores por Tipo (Centralizada para PDF e Painel)
const getCoresPorTipoFull = (tipo) => {
    const t = (tipo || "").toUpperCase();
    if (['ROUPEIRO', 'ARMARIO', 'COZINHA', 'PAINEL', 'MODULO', 'MULTIUSO', 'BALCAO', 'COMODA'].some(x => t.includes(x))) 
        return { hex: 'FFFF00', rgb: [255, 255, 0], txt: [0, 0, 0] };
    if (['CELULAR', 'TABLET', 'RELOGIO', 'ROBO', 'NOTEBOOK'].some(x => t.includes(x))) 
        return { hex: '00BFFF', rgb: [0, 191, 255], txt: [255, 255, 255] };
    if (t.includes('MESA')) 
        return { hex: '4CAF50', rgb: [76, 175, 80], txt: [255, 255, 255] };
    return { hex: 'FFFFFF', rgb: [255, 255, 255], txt: [0, 0, 0] };
};

window.exportarPDF = async () => {
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF('l', 'mm', 'a4');

    const selecionados = Array.from(document.querySelectorAll('.check-export:checked')).map(c => c.value);
    if (selecionados.length === 0) return alert("Selecione agendamentos!");

    const snap = await getDocs(collection(db, "agendamentos"));
    const agendas = [];
    snap.forEach(d => { if(selecionados.includes(d.id)) agendas.push({id: d.id, ...d.data()}); });

    const totalAgendas = agendas.length;
    const veiculosUnicos = new Set(agendas.map(a => a.veiculoAgrupado || a.senhaAgendamento)).size;

    // Cabeçalho Vermelho Simonetti
    docPdf.setFillColor(211, 47, 47);
    docPdf.rect(0, 0, 297, 20, 'F');
    docPdf.setFontSize(14);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text("MS RECEBIMENTO - MÓVEIS SIMONETTI", 10, 13);
    docPdf.setFontSize(10);
    docPdf.text(`VEÍCULOS: ${veiculosUnicos}  |  AGENDAS: ${totalAgendas}`, 230, 13);

    const columns = ["SENHA", "DATA", "CENTRAL", "CARGAS", "SITUAÇÃO", "BOX", "FORNECEDOR", "TIPO", "LINHA"];
    const tableBody = agendas.map(ag => [
        ag.veiculoAgrupado ? `${ag.senhaAgendamento}\n(VEÍCULO: ${ag.veiculoAgrupado})` : ag.senhaAgendamento,
        ag.data ? ag.data.split('-').reverse().join('/') : '-',
        ag.central || '-',
        ag.cargas || '-',
        ag.agendasituacao || 'PENDENTE',
        ag.box || '-',
        ag.fornecedor || '-',
        ag.tipoProduto || ag.tipo || '-',
        ag.linhaSeparacao || 'N/A'
    ]);

    docPdf.autoTable({
        head: [columns],
        body: tableBody,
        startY: 25,
        theme: 'grid',
        headStyles: { fillColor: [211, 47, 47], fontSize: 8, halign: 'center' },
        styles: { fontSize: 7, halign: 'center', cellPadding: 2, overflow: 'linebreak' },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 7) {
                const estilo = getCoresPorTipoFull(data.cell.raw);
                data.cell.styles.fillColor = estilo.rgb;
                data.cell.styles.textColor = estilo.txt;
            }
            if (data.section === 'body' && data.column.index === 4) {
                const situ = data.cell.raw;
                const config = situacoesCoresMaster[situ] || situacoesCoresMaster['DEFAULT'];
                data.cell.styles.fillColor = config.rgb;
                data.cell.styles.textColor = config.txt;
            }
            if (data.section === 'body' && data.column.index === 0 && data.cell.raw.includes('VEÍCULO:')) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [0, 0, 255];
            }
        }
    });

    // --- TRECHO AJUSTADO: RESUMO POR SITUAÇÃO EM TABELA ---
    const resumoObj = agendas.reduce((acc, curr) => {
        const s = curr.agendasituacao || 'PENDENTE';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    const resumoData = Object.keys(resumoObj).map(key => [key, resumoObj[key]]);

    docPdf.autoTable({
        head: [['SITUAÇÃO', 'QUANTIDADE']],
        body: resumoData,
        startY: docPdf.lastAutoTable.finalY + 10,
        margin: { left: 10 },
        tableWidth: 80, // Tabela mais estreita para o rodapé
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], fontSize: 8 },
        styles: { fontSize: 8, fontStyle: 'bold' },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 0) {
                const situ = data.cell.raw;
                const config = situacoesCoresMaster[situ] || situacoesCoresMaster['DEFAULT'];
                data.cell.styles.fillColor = config.rgb;
                data.cell.styles.textColor = config.txt;
            }
        }
    });

    docPdf.save(`Cargas_Simonetti_${new Date().toLocaleDateString()}.pdf`);
};

window.exportarExcel = async () => {
    const selecionados = Array.from(document.querySelectorAll('.check-export:checked')).map(c => c.value);
    if (selecionados.length === 0) return alert("Selecione agendamentos!");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatorio');

    worksheet.columns = [
        { header: 'SENHA', key: 'senha', width: 30 },
        { header: 'DATA', key: 'data', width: 12 },
        { header: 'CENTRAL', key: 'central', width: 15 },
        { header: 'CARGAS', key: 'cargas', width: 20 },
        { header: 'SITUAÇÃO', key: 'situacao', width: 25 },
        { header: 'BOX', key: 'box', width: 10 },
        { header: 'FORNECEDOR', key: 'fornecedor', width: 30 },
        { header: 'TIPO', key: 'tipo', width: 20 },
        { header: 'LINHA', key: 'linha', width: 15 }
    ];

    const snap = await getDocs(collection(db, "agendamentos"));
    const agendas = [];
    snap.forEach(d => { if(selecionados.includes(d.id)) agendas.push(d.data()); });

    agendas.forEach((ag) => {
        const situ = ag.agendasituacao || "PENDENTE";
        const configSitu = situacoesCoresMaster[situ] || situacoesCoresMaster['DEFAULT'];
        const estiloTipo = getCoresPorTipoFull(ag.tipoProduto || ag.tipo);

        const row = worksheet.addRow({
            senha: ag.veiculoAgrupado ? `${ag.senhaAgendamento} (VEÍCULO: ${ag.veiculoAgrupado})` : ag.senhaAgendamento,
            data: ag.data ? ag.data.split('-').reverse().join('/') : '',
            central: ag.central,
            cargas: ag.cargas,
            situacao: situ,
            box: ag.box || '-',
            fornecedor: ag.fornecedor,
            tipo: ag.tipoProduto || ag.tipo,
            linha: ag.linhaSeparacao || 'N/A'
        });

        // Cor da Situação
        const cellSitu = row.getCell('situacao');
        cellSitu.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + configSitu.hex } };
        cellSitu.font = { color: { argb: (configSitu.txt[0] === 255 ? 'FFFFFF' : '000000') }, bold: true };

        // Cor do Tipo de Produto
        const cellTipo = row.getCell('tipo');
        cellTipo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + estiloTipo.hex } };
        cellTipo.font = { color: { argb: (estiloTipo.txt[0] === 255 ? 'FFFFFF' : '000000') }, bold: true };

        // Destaque Senha Agrupada
        if(ag.veiculoAgrupado) {
            row.getCell('senha').font = { bold: true, color: { argb: '0000FF' } };
        }
    });

    // Cabeçalho Vermelho
    worksheet.getRow(1).eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD32F2F' } };
        cell.font = { color: { argb: 'FFFFFF' }, bold: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cargas_Simonetti_${Date.now()}.xlsx`;
    a.click();
};

window.abrirModalAcerto = (id, senha, equipeSalva, valorSalvo) => {
    document.getElementById('idAgendamentoAcerto').value = id;
    document.getElementById('senhaAgendamentoAcerto').value = senha;
    document.getElementById('valorDescarga').value = valorSalvo || '';

    const container = document.getElementById('listaCheckCooperados');
    const arrayEquipe = equipeSalva ? equipeSalva.split(', ') : [];

    // Garantir que a listaCooperados está carregada e ordenada
    const listaOrdenada = [...listaCooperados].sort((a, b) => a.nome.localeCompare(b.nome));

    container.innerHTML = listaOrdenada.map(c => {
        const estaMarcado = arrayEquipe.includes(c.nome) ? 'checked' : '';
        return `
            <div style="padding: 6px 0; border-bottom: 1px solid #eee; text-align: left;">
                <label style="cursor:pointer; display:flex; align-items:center; gap:10px; width:100%; font-size: 14px;">
                    <input type="checkbox" class="check-cooperado" value="${c.nome}" ${estaMarcado} style="width:18px; height:18px;"> 
                    <span style="white-space: nowrap;">${c.nome.toUpperCase()}</span>
                </label>
            </div>
        `;
    }).join('');

    document.getElementById('modalAcerto').style.display = 'flex';
};

// Ajuste para salvar unindo os nomes selecionados
window.salvarAcerto = async () => {
    const btnSalvar = document.querySelector('#modalAcerto .btn-puxar'); // Pega o botão de salvar
    const id = document.getElementById('idAgendamentoAcerto').value;
    
    // 1. Mudamos o nome da variável para senhaAgendamento para bater com o banco
    const senhaAgendamento = document.getElementById('senhaAgendamentoAcerto').value; 
    const valor = document.getElementById('valorDescarga').value;

    // Coleta todos os nomes marcados
    const selecionados = Array.from(document.querySelectorAll('.check-cooperado:checked'))
                              .map(ck => ck.value);
    
    const equipeString = selecionados.join(', ');

    if (selecionados.length === 0 || !valor) {
        alert("Selecione ao menos um colaborador e informe o valor!");
        return;
    }

    try {
        // Desativa o botão para evitar cliques duplos
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SALVANDO...';

        await updateDoc(doc(db, "agendamentos", id), {
            equipe: equipeString,
            valorDescarga: parseFloat(valor) // Salva como número para facilitar relatórios
        });

        // 2. Agora salvamos no histórico usando exatamente a variável com o nome correto
        await addDoc(collection(db, "historico"), {
            usuario: usuarioLogin,
            acao: "ACERTO MULTIPLO DESCARGA",
            detalhe: `Equipe: ${equipeString} | Valor: R$ ${valor}`,
            senha: senhaAgendamento, // <-- Agora o JavaScript reconhece perfeitamente!
            dataHora: serverTimestamp()
        });

        fecharModais();
        alert("Acerto salvo com sucesso!");
    } catch (e) {
        console.error("Erro ao salvar acerto:", e);
        alert("Erro ao salvar. Verifique o console.");
    } finally {
        // Restaura o botão
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> SALVAR ACERTO';
    }
};

window.filtrarModal = () => {
    const dataFiltro = document.getElementById('filtroDataModal').value;
    const busca = document.getElementById('buscaTextoModal').value.toUpperCase();
    
    // Converte a data do input (YYYY-MM-DD) para o formato brasileiro (DD/MM/YYYY)
    let dataBR = dataFiltro ? dataFiltro.split('-').reverse().join('/') : "";

    document.querySelectorAll('.linha-modal').forEach(tr => {
        // Agora ambos os lados vão comparar no formato DD/MM/YYYY
        const bateData = dataBR === "" || tr.getAttribute('data-data') === dataBR;
        const bateTexto = busca === "" || tr.getAttribute('data-txt').toUpperCase().includes(busca);
        
        tr.style.display = (bateData && bateTexto) ? '' : 'none';
    });
};

window.abrirModalSelecao = async () => {
    // Recarrega o banco antes de abrir o modal para buscar agendas novas
    const q = query(collection(db, "agendamentos"), orderBy("data", "desc"));
    const snap = await getDocs(q);
    todasAgendasDoBanco = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const lista = todasAgendasDoBanco.filter(a => !a.noPainel && a.status === 'Agendada');
    
    document.getElementById('corpoBuscaModal').innerHTML = lista.map(a => {
        const dataModalFormatada = a.data ? a.data.split('-').reverse().join('/') : '';
        return `
        <tr class="linha-modal" data-data="${dataModalFormatada}" data-txt="${a.senhaAgendamento || ''} ${a.fornecedor || ''}">
            <td><input type="checkbox" class="check-item" value="${a.id}" data-senha="${a.senhaAgendamento || ''}"></td>
            <td><b>${a.senhaAgendamento}</b></td>
            <td>${dataModalFormatada}</td>
            <td>${a.central}</td>
            <td style="font-size:10px;">${a.cargas || ''}</td>
            <td>${a.agendasituacao || 'PENDENTE'}</td>
            <td>${a.fornecedor}</td>
            <td>${a.tipoProduto || a.tipo || ''}</td>
        </tr>`;
    }).join('');

    const inputDataModal = document.getElementById('filtroDataModal');
    if (inputDataModal) {
        const hojeLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        hojeLocal.setDate(hojeLocal.getDate() + 1);
        
        const ano = hojeLocal.getFullYear();
        const mes = String(hojeLocal.getMonth() + 1).padStart(2, '0');
        const dia = String(hojeLocal.getDate()).padStart(2, '0');
        inputDataModal.value = `${ano}-${mes}-${dia}`;
    }

    document.getElementById('modalSelecao').style.display = 'flex';
    window.filtrarModal();
};

window.atualizarCampo = async (id, campo, valor) => {
    const valorUpper = valor.toUpperCase();
    
    // 1. Atualiza imediatamente no estado local
    const item = todasAgendasDoBanco.find(a => a.id === id);
    if (item) {
        item[campo] = valorUpper;
    }

    // 2. Renderiza a tela na hora para o usuário
    renderizarPainelPrincipal();

    // 3. Atualiza no Firestore em segundo plano
    try {
        await updateDoc(doc(db, "agendamentos", id), { [campo]: valorUpper });
    } catch (e) {
        console.error("Erro ao atualizar campo no banco:", e);
    }
};

window.puxarSelecionados = async () => {
    const checks = document.querySelectorAll('.check-item:checked');
    let idsAdicionados = [];

    for (let cb of checks) {
        const linhaPai = cb.closest('.linha-modal');
        if (linhaPai && linhaPai.style.display === 'none') {
            continue; 
        }

        const id = cb.value;
        idsAdicionados.push(id);

        // Atualiza estado local da memória
        const item = todasAgendasDoBanco.find(a => a.id === id);
        if (item) {
            item.noPainel = true;
        }

        // Envia para o banco
        await updateDoc(doc(db, "agendamentos", id), { noPainel: true });
        await addDoc(collection(db, "historico"), { 
            usuario: usuarioLogin, 
            acao: "ADICIONADO AO PAINEL", 
            senha: cb.dataset.senha, 
            dataHora: serverTimestamp() 
        });
    }

    // Atualiza a visualização local na hora e fecha o modal
    renderizarPainelPrincipal();
    fecharModais();
};

// ADICIONAR NO FINAL DO cargas-do-dia.js
window.verDetalhesComposicao = (id) => {
    const item = todasAgendasDoBanco.find(d => d.id === id);
    if (!item) return;

    document.getElementById('tituloComp').innerText = `Senha: ${item.senhaAgendamento || ''}`;
    let totalQtd = 0;
    
    let tabela = `
        <table style="width:100%; border-collapse:collapse; border: 1px solid #ddd; margin-top: 10px;">
            <thead style="background:#f4f4f4;">
                <tr>
                    <th style="padding:10px; border:1px solid #ddd;">CÓDIGO</th>
                    <th style="padding:10px; border:1px solid #ddd;">DESCRIÇÃO</th>
                    <th style="padding:10px; border:1px solid #ddd; text-align:center;">QTD</th>
                </tr>
            </thead>
            <tbody>`;

    if (item.composicao && item.composicao.length > 0) {
        item.composicao.forEach(prod => {
            const q = parseInt(prod.qtd || prod.quantidade || 0);
            totalQtd += q;
            tabela += `
                <tr>
                    <td style="padding:8px; border:1px solid #ddd; white-space:nowrap;">${prod.codigo || '-'}</td>
                    <td style="padding:8px; border:1px solid #ddd;">${prod.descricao || '-'}</td>
                    <td style="padding:8px; border:1px solid #ddd; text-align:center; font-weight:bold; color:red;">${q}</td>
                </tr>`;
        });
    } else {
        tabela += `<tr><td colspan="3" style="text-align:center; padding:15px; color:#666;">Nenhum item encontrado na composição.</td></tr>`;
    }

    tabela += `
            <tr style="background:#f9f9f9; font-weight:bold;">
                <td colspan="2" style="padding:10px; border:1px solid #ddd; text-align:right;">TOTAL:</td>
                <td style="padding:10px; border:1px solid #ddd; text-align:center; color:red;">${totalQtd}</td>
            </tr>
        </tbody>
    </table>`;

    document.getElementById('detalhesItens').innerHTML = tabela;
    document.getElementById('modalComposicao').style.display = "flex";
};

window.removerDoPainel = async (id) => { if(confirm("Remover do painel?")) await updateDoc(doc(db, "agendamentos", id), { noPainel: false }); };

window.fecharModais = () => {
    const modais = ['modalSelecao', 'modalAcerto', 'modalComposicao'];
    modais.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
};

// Evento global para fechar qualquer modal ao clicar fora do conteúdo
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        fecharModais();
    }
});

window.toggleAllModal = () => { const s = document.getElementById('selectAll').checked; document.querySelectorAll('.check-item').forEach(c => c.checked = s); };
window.logout = () => { localStorage.clear(); window.location.href = "index.html"; };
