import { app } from './firebase-config.js';
import {
    getFirestore, doc, setDoc, collection, addDoc, onSnapshot, query, orderBy,
    updateDoc, getDocs, limit, serverTimestamp, deleteDoc, getDoc, where
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// --- INICIALIZAÇÃO DO BANCO ---
const db = getFirestore(app);

// --- CONTROLE DE ACESSO AJUSTADO (Lendo as caixinhas do seu login) ---
// Douglas, aqui eu mudei para ler exatamente como o seu auth.js salva
const nivelAcessoRaw = localStorage.getItem('nivelAcesso') || "";
const usuarioNome = localStorage.getItem('username') || "Usuário";
const nivelAcesso = nivelAcessoRaw.toUpperCase().trim();

// 1. Verificação de Segurança
const niveisPermitidos = ["ADM", "LOGISTICA"];

if (!nivelAcesso || !niveisPermitidos.includes(nivelAcesso)) {
    console.error("Acesso negado! Nível lido:", nivelAcesso);
    // Se não encontrar o nível, ele volta pro login
    window.location.replace("index.html");
}

// 2. Exibição do Nome e Trava de Níveis
document.addEventListener('DOMContentLoaded', () => {
    // Tenta encontrar o ID do campo de nome (testa os dois nomes que usamos)
    const display = document.getElementById('txtUser') || document.getElementById('user-display');
    if (display) {
        display.innerText = usuarioNome.toUpperCase();
    }

    // Se for LEITOR, bloqueia as edições visualmente na hora
    if (nivelAcesso === "LEITOR") {
        const style = document.createElement('style');
        style.innerHTML = `
            .btn-edit, .btn-delete, .btn-save, [onclick*="excluir"], [onclick*="editar"], .btn-acoes { 
                display: none !important; 
            }
        `;
        document.head.appendChild(style);
    }
});

// 3. Função de Proteção para as funções de salvar/excluir
function temPermissao() {
    if (nivelAcesso === "ADM" || nivelAcesso === "LOGISTICA") {
        return true;
    }
    alert("Acesso Negado: Seu perfil (LEITOR) permite apenas a visualização.");
    return false;
}

// Função para registrar logs no Firebase (usando as variáveis novas)
async function registrarHistorico(acao, detalhes) {
    if (nivelAcesso === "ADM" || nivelAcesso === "LOGISTICA") {
        try {
            await addDoc(collection(db, "historico"), {
                usuario: usuarioNome,
                nivel: nivelAcesso,
                acao: acao,
                detalhes: detalhes,
                data: serverTimestamp()
            });
        } catch (e) { console.error("Erro ao registrar log:", e); }
    }
}

// --- ESTADO GLOBAL ---
let dadosOriginais = [];
let dadosFiltrados = [];
let paginaAtual = 1;
let itensPorPagina = 50;
let colunaFiltroAtual = '';
let ordemCrescente = true; // Controle de estado
let ultimaColuna = '';

// Define a data atual no fuso do Brasil (DD/MM/YYYY) como filtro inicial
const dataHojeBrasil = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
let filtrosSelecionados = {
    'data': [dataHojeBrasil]
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    escutarDadosFirebase();
});

// --- FUNÇÕES DE APOIO PARA TRIANGULAÇÃO E BITREM ---
function gerarCorHash(str) {
    if (!str) return '#666';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let cor = '#';
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 0xFF;
        cor += ('00' + value.toString(16)).substr(-2);
    }
    return cor;
}

// --- BUSCA DE DADOS EM TEMPO REAL (SEM INTERFERIR NA EDIÇÃO ATIVA) ---
function escutarDadosFirebase() {
    const q = query(collection(db, "agendamentos"));

    onSnapshot(q, (querySnapshot) => {
        dadosOriginais = [];
        querySnapshot.forEach((doc) => {
            dadosOriginais.push({ id: doc.id, ...doc.data() });
        });

        // PROTEÇÃO DE FOCO: Se o usuário estiver digitando em um input, evita re-renderizar para não perder o foco
        const elementoAtivo = document.activeElement;
        const estaEditando = elementoAtivo && (elementoAtivo.tagName === 'INPUT' || elementoAtivo.tagName === 'SELECT') && elementoAtivo.closest('#corpoTabela');

        if (!estaEditando) {
            aplicarFiltrosEBusca();
            atualizarVisualFiltros();
        }
    });
}

// --- RENDERIZAR TABELA ---
window.renderizarTabela = function() {
    const corpo = document.getElementById('corpoTabela');
    corpo.innerHTML = '';

    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    const listaExibicao = dadosFiltrados.slice(inicio, fim);

    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const isLeitor = usuarioLogado?.nivelAcesso === "LEITOR";

    // Lista de fornecedores que UTILIZAM o processo de TRIANGULAÇÃO
    const fornecedoresTriangulacao = ['DESIGN', 'SONOS',  'AMVOX', 'NEWELL BRANDS', 'ITATIAIA', 'RCELL', 'ACP', 'MGM', 'MONDIAL'];

    const getClasseTipo = (tipo) => {
        const t = (tipo || "").toUpperCase();
        if (['ARMARIO','COMODA','PAINEL','MULTIUSO','MODULO','COZINHA','ROUPEIRO'].some(x => t.includes(x))) return 'tipo-amarelo';
        if (t.includes('MESA')) return 'tipo-verde';
        if (['CELULAR','TABLET','RELOGIO','NOTEBOOK'].some(x => t.includes(x))) return 'tipo-azul';
        return 'tipo-padrao';
    };

    listaExibicao.forEach(item => {
        const tr = document.createElement('tr');

        // Tratamento da Central com Trim no Front
        const centralTratada = (item.central || '-').trim();

        // Verificação se o fornecedor atual exige Triangulação
        const fornecedorNome = (item.fornecedor || '').toUpperCase().trim();
        const requerTriangulacao = fornecedoresTriangulacao.some(f => fornecedorNome.includes(f));

        // Lógica de Triangulação (Manifesto / CIOT)
        const manifesto = item.manifesto || '';
        const ciot = item.ciot || '';
        const statusTriangulacao = item.statusTriangulacao || 'PENDENTE';
        const isEncerrado = statusTriangulacao === 'ENCERRADO';
        const precisaAlertaTriangulacao = requerTriangulacao && (manifesto || ciot) && !isEncerrado;

        // Estilos dinâmicos do Select quando ENCERRADO (Verde)
        const estiloSelectEncerrado = isEncerrado 
            ? 'background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; font-weight: bold;' 
            : 'background-color: #fff; color: #333; border: 1px solid #ccc;';

        // Lógica do BITREM (Identificador Único)
        const idBitrem = (item.idBitrem || '').trim().toUpperCase();
        const corBitrem = idBitrem ? gerarCorHash(idBitrem) : '#ccc';

        // HTML da Célula de Triangulação (Condicional por Fornecedor)
        let htmlTriangulacao = `<span style="color:#aaa;">-</span>`;
        if (requerTriangulacao) {
            htmlTriangulacao = `
                <div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
                    <input type="text" placeholder="Manifesto" class="control-input" style="padding:2px 4px; font-size:11px; width:95%; text-align:center;" 
                        value="${manifesto}" ${isLeitor ? 'disabled' : ''} 
                        onchange="atualizarCampo('${item.id}', 'manifesto', this.value)">
                    <input type="text" placeholder="CIOT" class="control-input" style="padding:2px 4px; font-size:11px; width:95%; text-align:center;" 
                        value="${ciot}" ${isLeitor ? 'disabled' : ''} 
                        onchange="atualizarCampo('${item.id}', 'ciot', this.value)">
                    <select onchange="atualizarCampo('${item.id}', 'statusTriangulacao', this.value)" ${isLeitor ? 'disabled' : ''} style="font-size:10px; border-radius:4px; padding:2px; ${estiloSelectEncerrado}">
                        <option value="PENDENTE" ${statusTriangulacao === 'PENDENTE' ? 'selected' : ''}>AUTORIZADO/PENDENTE</option>
                        <option value="ENCERRADO" ${isEncerrado ? 'selected' : ''}>ENCERRADO</option>
                    </select>
                    ${precisaAlertaTriangulacao ? `<span class="alert-triangulacao"><i class="fas fa-exclamation-triangle"></i> MANIFESTO NÃO ENCERRADO</span>` : ''}
                    ${isEncerrado ? `<span style="background-color: #28a745; color: white; font-size: 9px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin-top: 2px;"><i class="fas fa-check-circle"></i> ENCERRADO</span>` : ''}
                </div>
            `;
        }

        tr.innerHTML = `
            <td><input type="checkbox" class="check-export" value="${item.id}"></td>
            <td style="font-weight:bold; color:var(--primary)">${item.senhaAgendamento || '-'}</td>
            <td>${formatarData(item.data)}</td>
            <td style="font-weight:bold;">${centralTratada}</td>
            <td>${item.cargas || '-'}</td>
            
            <!-- COLUNA PEDIDO -->
            <td>
                <input type="text" class="control-input" style="padding:4px; width:90%; text-align:center" 
                value="${item.pedido || ''}" 
                ${isLeitor ? 'disabled' : ''} 
                onchange="atualizarCampo('${item.id}', 'pedido', this.value)">
            </td>

            <!-- COLUNA NOTAS -->
            <td>
                <input type="text" class="control-input" style="padding:4px; width:90%; text-align:center" 
                value="${item.notas || ''}" 
                ${isLeitor ? 'disabled' : ''} 
                onchange="atualizarCampo('${item.id}', 'notas', this.value)">
            </td>

            <td>${renderizarSelectSituacao(item)}</td>

            <!-- COLUNA TRIANGULAÇÃO (FILTRADA POR FORNECEDOR E COM DESTAQUE VERDE AO ENCERRAR) -->
            <td style="text-align:center;">
                ${htmlTriangulacao}
            </td>

            <!-- COLUNA BITREM (IDENTIFICADOR ÚNICO) -->
            <td style="text-align:center;">
                <input type="text" placeholder="ID BITREM" class="control-input" style="padding:4px; font-size:11px; width:90%; text-align:center; font-weight:bold;" 
                    value="${idBitrem}" ${isLeitor ? 'disabled' : ''} 
                    onchange="atualizarCampo('${item.id}', 'idBitrem', this.value.toUpperCase())">
                ${idBitrem ? `<div class="badge-bitrem" style="background-color:${corBitrem};"><i class="fas fa-truck-moving"></i> ${idBitrem}</div>` : ''}
            </td>

            <td style="text-align:left">${item.fornecedor || '-'}</td>
            <td>
                <span class="${getClasseTipo(item.tipoProduto)}">
                    ${item.tipoProduto || '-'}
                </span>
            </td>
            <td>${item.linhaSeparacao || '-'}</td>
            <td>
                <button onclick="abrirComposicao('${item.id}')" style="border:none; background:none; cursor:pointer; color:#1565c0">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        corpo.appendChild(tr);
    });

    atualizarControlesPaginacao();
};

// --- FILTROS E BUSCA ---
window.atualizarFiltros = function () {
    aplicarFiltrosEBusca();
};


// --- APLICAÇÃO DE FILTROS COM IGUALDADE DE ESPAÇOS NA CENTRAL (.TRIM) ---
function aplicarFiltrosEBusca() {
    const termoBusca = document.getElementById('inputBusca').value.toLowerCase().trim();

    dadosFiltrados = dadosOriginais.filter(item => {
        // 1. Busca Geral
        const matchCamposNormais = Object.values(item).some(val =>
            String(val).toLowerCase().includes(termoBusca)
        );

        const matchComposicao = item.composicao?.some(prod =>
            String(prod.codigo).toLowerCase().includes(termoBusca) ||
            String(prod.descricao).toLowerCase().includes(termoBusca)
        );

        const matchBusca = matchCamposNormais || matchComposicao;

        // 2. Filtros por Coluna com tratamento TRIM para Central
        const matchFiltros = Object.keys(filtrosSelecionados).every(coluna => {
            const selecionadosNaColuna = filtrosSelecionados[coluna];
            if (!selecionadosNaColuna || selecionadosNaColuna.length === 0) return true;

            let valorParaComparar = '';

            if (coluna === 'data') {
                valorParaComparar = formatarData(item[coluna]);
            } else if (coluna === 'central') {
                valorParaComparar = String(item[coluna] || '').trim(); // Remove espaços extras
            } else {
                valorParaComparar = String(item[coluna] || '');
            }

            return selecionadosNaColuna.includes(valorParaComparar);
        });

        return matchBusca && matchFiltros;
    });

    atualizarVisualFiltros();
    paginaAtual = 1;
    renderizarTabela();
}

function atualizarVisualFiltros() {
    // Lista de colunas que possuem filtro (baseado no seu objeto de estado)
    const colunasComFiltro = Object.keys(filtrosSelecionados).filter(col => filtrosSelecionados[col].length > 0);

    // Resetar todos os botões primeiro (Remova ou ajuste os IDs conforme seu HTML)
    document.querySelectorAll('.btn-abrir-filtro').forEach(btn => {
        btn.style.background = 'none';
        btn.style.color = 'inherit';
        btn.innerHTML = '<i class="fas fa-filter"></i>'; // Ícone padrão
    });

    // Aplicar destaque nos ativos
    colunasComFiltro.forEach(coluna => {
        // Aqui buscamos o elemento que você clica para abrir o filtro
        // Exemplo: um elemento com id="filter-central"
        const btn = document.getElementById(`filter-${coluna}`);
        if (btn) {
            btn.style.background = '#ffeb3b'; // Amarelo
            btn.style.color = '#000';
            btn.style.padding = '2px 6px';
            btn.style.borderRadius = '4px';
            btn.style.fontSize = '10px';
            btn.innerHTML = 'APLICADO';
        }
    });
}

// --- ÁRVORE/LISTA DE FILTROS POR COLUNA COM TRATAMENTO DE ESPAÇOS (TRIM) ---
window.abrirFiltro = function (coluna, event) {
    event.stopPropagation();
    colunaFiltroAtual = coluna;
    const modal = document.getElementById('modalFiltro');
    const container = document.getElementById('opcoesFiltro');

    if (coluna === 'data') {
        const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const estrutura = {};

        dadosOriginais.forEach(item => {
            const dataBruta = item.data || '';
            if (!dataBruta) return;

            const [ano, mes, dia] = dataBruta.split('-');
            const dataFormatada = `${dia}/${mes}/${ano}`;

            if (!estrutura[ano]) estrutura[ano] = {};
            if (!estrutura[ano][mes]) estrutura[ano][mes] = [];

            if (!estrutura[ano][mes].some(d => d.bruto === dataBruta)) {
                estrutura[ano][mes].push({ bruto: dataBruta, formatada: dataFormatada, diaNum: parseInt(dia, 10) });
            }
        });

        const temFiltroAtivo = filtrosSelecionados['data'] && filtrosSelecionados['data'].length > 0;
        let htmlArvore = `<div style="font-family: sans-serif; font-size: 13px; user-select: none;">`;

        Object.keys(estrutura).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach(ano => {
            const todosDiasAno = [];
            Object.keys(estrutura[ano]).forEach(m => {
                estrutura[ano][m].forEach(d => todosDiasAno.push(d.formatada));
            });

            const anoChecked = temFiltroAtivo ? todosDiasAno.every(d => filtrosSelecionados['data'].includes(d)) : true;
            const temDiaMarcadoNoAno = temFiltroAtivo && todosDiasAno.some(d => filtrosSelecionados['data'].includes(d));
            const displayAno = temDiaMarcadoNoAno ? 'block' : 'none';
            const setaAno = temDiaMarcadoNoAno ? '▼' : '▶';

            htmlArvore += `
                <div style="margin-bottom: 5px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span onclick="this.parentElement.nextElementSibling.style.display = this.parentElement.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.innerText = this.innerText === '▶' ? '▼' : '▶';" style="cursor: pointer; width: 12px; font-size: 10px; color: #666;">${setaAno}</span>
                        <label style="font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <input type="checkbox" class="chk-ano-arvore" onchange="const chks = this.parentElement.parentElement.nextElementSibling.querySelectorAll('.check-item-filtro'); chks.forEach(c => c.checked = this.checked);" ${anoChecked ? 'checked' : ''}>
                            ${ano}
                        </label>
                    </div>
                    <div class="meses-container" style="display: ${displayAno}; margin-left: 18px; margin-top: 4px;">`;

            Object.keys(estrutura[ano]).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach(mes => {
                const nomeMes = nomesMeses[parseInt(mes, 10) - 1] || mes;
                const todosDiasMes = estrutura[ano][mes].map(d => d.formatada);

                const mesChecked = temFiltroAtivo ? todosDiasMes.every(d => filtrosSelecionados['data'].includes(d)) : true;
                const temDiaMarcadoNoMes = temFiltroAtivo && todosDiasMes.some(d => filtrosSelecionados['data'].includes(d));
                const displayMes = temDiaMarcadoNoMes ? 'block' : 'none';
                const setaMes = temDiaMarcadoNoMes ? '▼' : '▶';

                htmlArvore += `
                    <div style="margin-bottom: 3px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span onclick="this.parentElement.nextElementSibling.style.display = this.parentElement.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.innerText = this.innerText === '▶' ? '▼' : '▶';" style="cursor: pointer; width: 12px; font-size: 10px; color: #666;">${setaMes}</span>
                            <label style="cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: 500;">
                                <input type="checkbox" class="chk-mes-arvore" onchange="const chks = this.parentElement.parentElement.nextElementSibling.querySelectorAll('.check-item-filtro'); chks.forEach(c => c.checked = this.checked);" ${mesChecked ? 'checked' : ''}>
                                ${nomeMes}
                            </label>
                        </div>
                        <div class="dias-container" style="display: ${displayMes}; margin-left: 18px; margin-top: 2px;">`;

                estrutura[ano][mes].sort((a, b) => a.diaNum - b.diaNum).forEach(dataObj => {
                    const estaChecado = filtrosSelecionados['data']?.includes(dataObj.formatada);
                    htmlArvore += `
                        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; cursor: pointer; padding-left: 5px;">
                            <input type="checkbox" value="${dataObj.formatada}" ${estaChecado || !temFiltroAtivo ? 'checked' : ''} class="check-item-filtro"> 
                            <span>${dataObj.formatada.split('/')[0]}</span>
                        </label>
                    `;
                });
                htmlArvore += `</div></div>`;
            });
            htmlArvore += `</div></div>`;
        });
        htmlArvore += `</div>`;
        container.innerHTML = htmlArvore;
    } else {
        // Normalização com .trim() para a coluna Central e outras colunas
        const extrairValor = (item) => {
            const v = String(item[coluna] || '');
            return coluna === 'central' ? v.trim() : v;
        };

        const todosValoresUnicos = [...new Set(dadosOriginais.map(extrairValor))].sort();
        const valoresVivos = [...new Set(dadosFiltrados.map(extrairValor))];

        container.innerHTML = todosValoresUnicos.map(valor => {
            const estaVivo = valoresVivos.includes(valor);
            const estaChecado = filtrosSelecionados[coluna]?.includes(valor);
            const estiloLabel = estaVivo ? 'color: #333; font-weight: 500;' : 'color: #ccc; cursor: not-allowed;';

            return `
                <label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer; ${estiloLabel}">
                    <input type="checkbox" value="${valor}" ${estaChecado ? 'checked' : ''} class="check-item-filtro"> 
                    ${valor === '' ? '(Vazio)' : valor}
                </label>
            `;
        }).join('');
    }
    modal.style.display = 'flex';
};

window.aplicarFiltroColuna = function () {
    // Captura os valores que você marcou nos checkboxes do modal
    const selecionados = Array.from(document.querySelectorAll('.check-item-filtro:checked'))
        .map(cb => cb.value);

    // Salva no estado global de filtros
    filtrosSelecionados[colunaFiltroAtual] = selecionados;

    fecharModais();
    aplicarFiltrosEBusca(); // Dispara a atualização da tabela e dos outros filtros
};

window.exportarPDF = async (modo) => {
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF('p', 'mm', 'a4');

    const getCoresPorTipo = (tipo) => {
        const t = (tipo || "").toUpperCase();
        if (['ARMARIO', 'COMODA', 'PAINEL', 'MULTIUSO', 'MODULO', 'COZINHA', 'ROUPEIRO'].some(x => t.includes(x)))
            return { rgb: [255, 255, 0], text: [0, 0, 0] };
        if (t.includes('MESA'))
            return { rgb: [76, 175, 80], text: [255, 255, 255] };
        if (['CELULAR', 'TABLET', 'RELOGIO', 'NOTEBOOK'].some(x => t.includes(x)))
            return { rgb: [0, 191, 255], text: [255, 255, 255] };
        return { rgb: [255, 255, 255], text: [0, 0, 0] };
    };

    // --- NOVA FUNÇÃO DE CORES PARA SITUAÇÃO NO PDF (RGB) ---
    const getCoresPorSituacao = (situacao) => {
        const s = (situacao || 'AGUARDANDO').toUpperCase().trim();
        const cores = {
            'AGUARDANDO': { rgb: [66, 66, 66], text: [255, 255, 255] },
            'OK NO AJUSTE': { rgb: [6, 107, 60], text: [255, 255, 255] },
            'SEM NOTA': { rgb: [13, 71, 161], text: [255, 255, 255] },
            'REAGENDADA': { rgb: [225, 190, 231], text: [74, 20, 140] },
            'SOBRE AJUSTE': { rgb: [255, 224, 130], text: [95, 75, 0] },
            'CANCELADA': { rgb: [183, 28, 28], text: [255, 255, 255] },
            'OC PENDENTE': { rgb: [207, 216, 220], text: [55, 71, 79] },
            'SEM TRIANGULACAO': { rgb: [255, 205, 210], text: [183, 28, 28] },
            'VENCIMENTO ERRADO': { rgb: [183, 28, 28], text: [255, 255, 255] },
            'FALTA CTE': { rgb: [81, 45, 168], text: [255, 255, 255] },
            'NOTA ERRADA': { rgb: [255, 204, 188], text: [230, 74, 25] },
            'CTE DIVERGENTE': { rgb: [121, 85, 72], text: [255, 255, 255] }
        };
        return cores[s] || { rgb: [66, 66, 66], text: [255, 255, 255] };
    };

    const selecionados = Array.from(document.querySelectorAll('.check-export:checked')).map(c => c.value);
    if (selecionados.length === 0) return alert("Selecione agendamentos!");

    const snap = await getDocs(collection(db, "agendamentos"));
    const agendasMap = {};
    snap.forEach(d => { agendasMap[d.id] = d.data(); });
    const agendas = selecionados.map(id => agendasMap[id]).filter(a => a !== undefined);

    // Cabeçalho fixo do topo
    docPdf.setFillColor(192, 0, 0);
    docPdf.rect(0, 0, 210, 25, 'F');
    docPdf.setFontSize(18);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text("MÓVEIS SIMONETTI - LOGÍSTICA", 14, 16);

    docPdf.setFontSize(10);
    docPdf.setTextColor(0, 0, 0);
    docPdf.text(`TOTAL DE AGENDAS: ${agendas.length}`, 14, 32);
    docPdf.setTextColor(100);
    docPdf.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 145, 32);

    let currentY = 38;

    if (modo === 'completo') {
        // --- LÓGICA PARA O PDF COMPLETO (Blocos Elegantes) ---
        agendas.forEach((ag) => {
            if (currentY > 240) { docPdf.addPage(); currentY = 20; }

            docPdf.autoTable({
                // Adicionado 'NOTAS' e 'SITUAÇÃO' no cabeçalho
                head: [['SENHA', 'DATA', 'CENTRAL', 'CARGAS', 'NOTAS', 'SITUAÇÃO', 'FORNECEDOR', 'TIPO', 'LINHA']],
                body: [[
                    ag.senhaAgendamento,
                    ag.data.split('-').reverse().join('/'),
                    ag.central,
                    ag.cargas || '-',
                    ag.notas || '-',
                    ag.situacao || 'AGUARDANDO',
                    ag.fornecedor,
                    ag.tipoProduto,
                    ag.linhaSeparacao || 'N/A'
                ]],
                startY: currentY,
                theme: 'grid',
                headStyles: { fillColor: [192, 0, 0], textColor: 255, fontSize: 7, halign: 'center' },
                styles: { fontSize: 7, halign: 'center', cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
                didParseCell: (data) => {
                    // Posição 5 agora é a coluna SITUÇÃO, e Posição 7 é a coluna TIPO
                    if (data.section === 'body') {
                        if (data.column.index === 7) {
                            const estilo = getCoresPorTipo(data.cell.raw);
                            data.cell.styles.fillColor = estilo.rgb;
                            data.cell.styles.textColor = estilo.text;
                        }
                        if (data.column.index === 5) {
                            const estiloSituacao = getCoresPorSituacao(data.cell.raw);
                            data.cell.styles.fillColor = estiloSituacao.rgb;
                            data.cell.styles.textColor = estiloSituacao.text;
                        }
                    }
                }
            });

            currentY = docPdf.lastAutoTable.finalY;

            if (ag.composicao && ag.composicao.length > 0) {
                docPdf.autoTable({
                    head: [['CÓDIGO', 'DESCRIÇÃO DO PRODUTO', 'QTD']],
                    body: ag.composicao.map(i => [i.codigo, i.descricao, i.qtd]),
                    startY: currentY,
                    margin: { left: 14 },
                    theme: 'grid',
                    headStyles: { fillColor: [235, 235, 235], textColor: 0, fontSize: 7.5, fontStyle: 'bold' },
                    styles: { fontSize: 7.5, cellPadding: 2 },
                    columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 20, halign: 'center' } }
                });
                currentY = docPdf.lastAutoTable.finalY + 10;
            } else {
                currentY += 8;
            }
        });
    } else {
        // --- LÓGICA PARA O PDF BÁSICO (Tabela Contínua do Print) ---
        const tableBody = agendas.map(ag => [
            ag.senhaAgendamento,
            ag.data.split('-').reverse().join('/'),
            ag.central,
            ag.cargas || '-',
            ag.notas || '-',
            ag.situacao || 'AGUARDANDO',
            ag.fornecedor,
            ag.tipoProduto,
            ag.linhaSeparacao || 'N/A'
        ]);

        docPdf.autoTable({
            // Adicionado 'NOTAS' e 'SITUAÇÃO' no cabeçalho
            head: [['SENHA', 'DATA', 'CENTRAL', 'CARGAS', 'NOTAS', 'SITUAÇÃO', 'FORNECEDOR', 'TIPO', 'LINHA']],
            body: tableBody,
            startY: currentY,
            theme: 'grid',
            headStyles: { fillColor: [192, 0, 0], textColor: 255, fontSize: 7, halign: 'center' },
            styles: { fontSize: 7, halign: 'center', cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
            didParseCell: (data) => {
                // Posição 5 agora é a coluna SITUÇÃO, e Posição 7 é a coluna TIPO
                if (data.section === 'body') {
                    if (data.column.index === 7) {
                        const estilo = getCoresPorTipo(data.cell.raw);
                        data.cell.styles.fillColor = estilo.rgb;
                        data.cell.styles.textColor = estilo.text;
                    }
                    if (data.column.index === 5) {
                        const estiloSituacao = getCoresPorSituacao(data.cell.raw);
                        data.cell.styles.fillColor = estiloSituacao.rgb;
                        data.cell.styles.textColor = estiloSituacao.text;
                    }
                }
            }
        });
    }

    docPdf.save(`Relatorio_Simonetti_${modo.toUpperCase()}.pdf`);
};

window.exportarExcel = async (modo) => {
    const selecionados = Array.from(document.querySelectorAll('.check-export:checked')).map(c => c.value);
    if (selecionados.length === 0) return alert("Selecione agendamentos!");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatorio');

    const getEstiloExcel = (tipo) => {
        const t = (tipo || "").toUpperCase();
        if (['ARMARIO', 'COMODA', 'PAINEL', 'MULTIUSO', 'MODULO', 'COZINHA', 'ROUPEIRO'].some(x => t.includes(x)))
            return { fg: 'FFFF00', txt: '000000' };
        if (t.includes('MESA'))
            return { fg: '4CAF50', txt: 'FFFFFF' };
        if (['CELULAR', 'TABLET', 'RELOGIO', 'NOTEBOOK'].some(x => t.includes(x)))
            return { fg: '00BFFF', txt: 'FFFFFF' };
        return { fg: 'FFFFFF', txt: '000000' };
    };

    // --- NOVA FUNÇÃO DE CORES PARA SITUAÇÃO NO EXCEL (Hexadecimal ARGB) ---
    const getEstiloSituacaoExcel = (situacao) => {
        const s = (situacao || 'AGUARDANDO').toUpperCase().trim();
        const cores = {
            'AGUARDANDO': { fg: 'FF424242', txt: 'FFFFFFFF' },
            'OK NO AJUSTE': { fg: 'FF066B3C', txt: 'FFFFFFFF' },
            'SEM NOTA': { fg: 'FF0D47A1', txt: 'FFFFFFFF' },
            'REAGENDADA': { fg: 'FFE1BEE7', txt: 'FF4A148C' },
            'SOBRE AJUSTE': { fg: 'FFFFE082', txt: 'FF5F4B00' },
            'CANCELADA': { fg: 'FFB71C1C', txt: 'FFFFFFFF' },
            'OC PENDENTE': { rgb: 'FFCFD8DC', txt: 'FF37474F' },
            'SEM TRIANGULACAO': { fg: 'FFFFCDD2', txt: 'FFB71C1C' },
            'VENCIMENTO ERRADO': { fg: 'FFB71C1C', txt: 'FFFFFFFF' },
            'FALTA CTE': { fg: 'FF512DA8', txt: 'FFFFFFFF' },
            'NOTA ERRADA': { fg: 'FFFFCCBC', txt: 'FFE64A19' },
            'CTE DIVERGENTE': { fg: 'FF795548', txt: 'FFFFFFFF' }
        };
        return cores[s] || { fg: 'FF424242', txt: 'FFFFFFFF' };
    };

    // Estrutura de colunas expandida para Notas e Situação
    const columns = [
        { header: 'Senha', key: 'Senha', width: 25 },
        { header: 'Data', key: 'Data', width: 12 },
        { header: 'Central', key: 'Central', width: 15 },
        { header: 'Cargas', key: 'Cargas', width: 15 },
        { header: 'Pedido', key: 'Pedido', width: 15 },
        { header: 'Notas', key: 'Notas', width: 25 },         // Adicionado
        { header: 'Situação', key: 'Situacao', width: 20 },   // Adicionado
        { header: 'Fornecedor', key: 'Fornecedor', width: 25 },
        { header: 'Tipo', key: 'Tipo', width: 20 },
        { header: 'Linha', key: 'linhaSeparacao', width: 15 }
    ];

    if (modo === 'completo') {
        columns.push(
            { header: 'Cód. Item', key: 'Cod_Item', width: 15 },
            { header: 'Descrição', key: 'Descricao', width: 40 },
            { header: 'Qtd', key: 'Qtd', width: 10 }
        );
    }
    worksheet.columns = columns;

    const snap = await getDocs(collection(db, "agendamentos"));

    const agendamentosProcessados = [];
    snap.forEach(doc => {
        if (selecionados.includes(doc.id)) {
            agendamentosProcessados.push(doc.data());
        }
    });

    agendamentosProcessados.sort((a, b) => a.data.localeCompare(b.data));

    let dataAnterior = null;

    agendamentosProcessados.forEach(d => {
        const dataFormatada = d.data.split('-').reverse().join('/');

        if (dataAnterior && dataAnterior !== dataFormatada) {
            worksheet.addRow({});
        }

        // Dados base alimentados com notas e situacao
        const base = {
            Senha: d.senhaAgendamento,
            Data: dataFormatada,
            Central: d.central,
            Cargas: d.cargas,
            Pedido: d.pedido,
            Notas: d.notas || '-',
            Situacao: d.situacao || 'AGUARDANDO',
            Fornecedor: d.fornecedor,
            Tipo: d.tipoProduto,
            linhaSeparacao: d.linhaSeparacao || "N/A"
        };

        if (modo === 'completo' && d.composicao && d.composicao.length > 0) {
            d.composicao.forEach(item => {
                const row = worksheet.addRow({ ...base, Cod_Item: item.codigo, Descricao: item.descricao, Qtd: item.qtd });
                aplicarEstiloCelula(row, d.tipoProduto, d.situacao);
            });
        } else {
            const row = worksheet.addRow(base);
            aplicarEstiloCelula(row, d.tipoProduto, d.situacao);
        }

        dataAnterior = dataFormatada;
    });

    // Modificada para receber e processar a situação também
    function aplicarEstiloCelula(row, tipo, situacao) {
        row.eachCell({ includeEmpty: false }, (cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Estilização da célula Tipo
        const estilo = getEstiloExcel(tipo);
        const cellTipo = row.getCell('Tipo');
        cellTipo.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: estilo.fg }
        };
        cellTipo.font = { color: { argb: estilo.txt }, bold: true };

        // --- NOVA ESTILIZAÇÃO DA CÉLULA SITUAÇÃO NO EXCEL ---
        const estiloSit = getEstiloSituacaoExcel(situacao);
        const cellSit = row.getCell('Situacao');
        cellSit.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: estiloSit.fg }
        };
        cellSit.font = { color: { argb: estiloSit.txt }, bold: true };
    }

    // Estilo do Cabeçalho Vermelho Simonetti
    worksheet.getRow(1).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C00000' } };
        cell.font = { color: { argb: 'FFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center' };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Simonetti_Export_${modo.toUpperCase()}.xlsx`;
    a.click();
};

// --- AUXILIARES ---
async function atualizarCampo(id, campo, valor) {
    try {
        await updateDoc(doc(db, "agendamentos", id), { [campo]: valor });
    } catch (e) { console.error("Erro ao atualizar:", e); }
}

function renderizarSelectSituacao(item) {
    // Lista de status atualizada com base no seu CSS
    const status = [
        'AGUARDANDO',
        'OK NO AJUSTE',
        'SEM NOTA',
        'REAGENDADA',
        'SOBRE AJUSTE',
        'CANCELADA',
        'OC PENDENTE',
        'SEM TRIANGULACAO',
        'VENCIMENTO ERRADO',
        'FALTA CTE',
        'NOTA ERRADA',
        'CTE DIVERGENTE'
    ];

    // Mapeamento de Cores (Fundo e Texto)
    const cores = {
        'AGUARDANDO': { bg: '#424242', text: '#ffffff' },
        'OK NO AJUSTE': { bg: '#066b3c', text: '#ffffff' },
        'SEM NOTA': { bg: '#0d47a1', text: '#ffffff' },
        'REAGENDADA': { bg: '#e1bee7', text: '#4a148c' },
        'SOBRE AJUSTE': { bg: '#ffe082', text: '#5f4b00' },
        'CANCELADA': { bg: '#b71c1c', text: '#ffffff' },
        'OC PENDENTE': { bg: '#cfd8dc', text: '#37474f' },
        'SEM TRIANGULACAO': { bg: '#ffcdd2', text: '#b71c1c' },
        'VENCIMENTO ERRADO': { bg: '#b71c1c', text: '#ffffff' },
        'FALTA CTE': { bg: '#512da8', text: '#ffffff' },
        'NOTA ERRADA': { bg: '#ffccbc', text: '#e64a19' },
        'CTE DIVERGENTE': { bg: '#795548', text: '#ffffff' }
    };

    const estiloAtual = cores[item.situacao] || { bg: '#424242', text: '#ffffff' };

    // Adicionei um contorno amarelo caso seja VENCIMENTO ERRADO
    const borderExtra = item.situacao === 'VENCIMENTO ERRADO' ? 'outline: 2px solid #ffd600;' : '';

    // --- NOVA REGRA DE ACESSO ---
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const isLeitor = usuarioLogado?.nivelAcesso === "LEITOR";

    return `
        <select onchange="atualizarCampo('${item.id}', 'situacao', this.value)" 
            ${isLeitor ? 'disabled' : ''} 
            style="background:${estiloAtual.bg}; color:${estiloAtual.text}; border:none; border-radius:15px; padding:4px 8px; font-size:10px; font-weight:bold; cursor:pointer; ${borderExtra} opacity: ${isLeitor ? '0.8' : '1'};">
            ${status.map(s => `<option value="${s}" ${item.situacao === s ? 'selected' : ''} style="background: white; color: black;">${s}</option>`).join('')}
        </select>
    `;
}

function formatarData(data) {
    if (!data) return '-';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
}

window.fecharModais = function () {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
};

window.atualizarControlesPaginacao = function () {
    const totalItens = dadosFiltrados.length;
    const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1;

    // 1. Atualiza o texto informativo
    const info = document.getElementById('infoPaginacao');
    if (info) {
        info.innerText = `Mostrando ${totalItens} registros (Página ${paginaAtual} de ${totalPaginas})`;
    }

    // 2. Atualiza o número no meio dos botões
    const numPagina = document.getElementById('numeroPaginaAtiva');
    if (numPagina) {
        numPagina.innerText = paginaAtual;
    }

    // 3. Opcional: Desativar botões visualmente se não houver para onde ir
    // Isso evita que o usuário clique em "Próximo" sem necessidade
    const btnAnterior = document.querySelector("button[onclick*='anterior']");
    const btnProximo = document.querySelector("button[onclick*='proximo']");

    if (btnAnterior) btnAnterior.disabled = (paginaAtual === 1);
    if (btnProximo) btnProximo.disabled = (paginaAtual === totalPaginas);
};

// Função para mudar a quantidade de itens por página
window.mudarTamanhoPagina = function (valor) {
    itensPorPagina = parseInt(valor);
    paginaAtual = 1;
    renderizarTabela();
};

window.mudarPagina = function (direcao) {
    const totalPaginas = Math.ceil(dadosFiltrados.length / itensPorPagina);
    if (direcao === 'proximo' && paginaAtual < totalPaginas) {
        paginaAtual++;
    } else if (direcao === 'anterior' && paginaAtual > 1) {
        paginaAtual--;
    }
    renderizarTabela();
};

// --- ATUALIZAÇÃO DE CAMPOS (CORRIGIDO PARA SALVAR NO FIRESTORE) ---
window.atualizarCampo = async function (id, campo, valor) {
    if (nivelAcesso === "LEITOR") return;

    try {
        // 1. Atualiza a memória local para atualizar a tela na hora
        const itemLocal = dadosOriginais.find(item => item.id === id);
        if (itemLocal) {
            itemLocal[campo] = valor;
        }

        // 2. Se for alteração visual relevante (triangulação ou situação), re-renderiza a tabela
        if (campo === 'statusTriangulacao' || campo === 'situacao') {
            renderizarTabela();
        }

        // 3. Referência correta do documento no Firestore
        const docRef = doc(db, "agendamentos", id);
        const docSnap = await getDoc(docRef);
        const dadoAntigo = docSnap.exists() ? (docSnap.data()[campo] || "") : "";

        // 4. Salva no banco de dados (Firestore)
        await updateDoc(docRef, { [campo]: valor });

        // 5. Registra o histórico
        registrarHistorico("ALTERAÇÃO", `Campo ${campo} alterado de "${dadoAntigo}" para "${valor}" no ID: ${id}`);

        console.log(`Campo ${campo} atualizado com sucesso no banco!`);
    } catch (e) {
        console.error("Erro ao atualizar campo no Firestore:", e);
    }
};

window.marcarTodos = function (masterCheckbox) {
    const checkboxes = document.querySelectorAll('#corpoTabela input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
};

window.marcarTodosFiltro = function (valor) {
    const checkboxes = document.querySelectorAll('.check-item-filtro');
    checkboxes.forEach(cb => cb.checked = valor);
};

window.ordenarTabela = function (coluna) {
    // Se clicar na mesma coluna, inverte a ordem. Se for outra, começa crescente.
    if (ultimaColuna === coluna) {
        ordemCrescente = !ordemCrescente;
    } else {
        ordemCrescente = true;
        ultimaColuna = coluna;
    }

    dadosFiltrados.sort((a, b) => {
        let valA = String(a[coluna] || "").toLowerCase();
        let valB = String(b[coluna] || "").toLowerCase();

        // Lógica para datas (se a coluna for 'data', inverte para comparar corretamente)
        if (coluna === 'data') {
            return ordemCrescente ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        if (valA < valB) return ordemCrescente ? -1 : 1;
        if (valA > valB) return ordemCrescente ? 1 : -1;
        return 0;
    });

    renderizarTabela();
};

window.abrirComposicao = async function (id) {
    const docSnap = await getDoc(doc(db, "agendamentos", id));

    if (docSnap.exists()) {
        const dados = docSnap.data();
        const modal = document.getElementById('modalComposicao');
        const container = document.getElementById('detalhesItens');
        const titulo = document.getElementById('tituloComp');

        titulo.innerText = `Detalhes: ${dados.senhaAgendamento || 'N/A'}`;

        if (dados.composicao && dados.composicao.length > 0) {
            // Calcula o total das quantidades
            const totalQtd = dados.composicao.reduce((acc, item) => acc + (Number(item.qtd) || 0), 0);

            container.innerHTML = `
                <div style="overflow-x: auto; overflow-y: auto; max-height: 400px;">
                    <table style="width:100%; border-collapse: collapse; font-family: sans-serif; font-size: 13px;">
                        <thead>
                            <tr style="background: #c00000; color: white;">
                                <th style="padding:12px; border: 1px solid #ddd; width: 20%;">CÓDIGO</th>
                                <th style="padding:12px; border: 1px solid #ddd; width: 65%;">DESCRIÇÃO</th>
                                <th style="padding:12px; border: 1px solid #ddd; width: 15%;">QTD</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dados.composicao.map(item => `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding:10px; text-align:center; border: 1px solid #ddd;">${item.codigo}</td>
                                    <td style="padding:10px; border: 1px solid #ddd; text-transform: uppercase;">${item.descricao}</td>
                                    <td style="padding:10px; text-align:center; border: 1px solid #ddd; font-weight: bold; color: red;">${item.qtd}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f9f9f9; font-weight: bold;">
                                <td colspan="2" style="padding:10px; text-align: right; border: 1px solid #ddd;">TOTAL:</td>
                                <td style="padding:10px; text-align: center; border: 1px solid #ddd; color: red;">${totalQtd}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
        } else {
            container.innerHTML = '<p style="text-align:center; padding:20px;">Nenhum item encontrado.</p>';
        }

        modal.style.display = 'flex';
    }
};

// --- FUNÇÃO AUXILIAR PARA DEFINIR CORES DOS CARDS NA CÓPIA ---
const getCoresPorTipoCard = (tipo) => {
    const t = (tipo || "").toUpperCase();
    if (['ARMARIO', 'COMODA', 'PAINEL', 'MULTIUSO', 'MODULO', 'COZINHA', 'ROUPEIRO'].some(x => t.includes(x)))
        return { bg: '#fff9c4', text: '#827717' }; // Amarelo suave
    if (t.includes('MESA'))
        return { bg: '#c8e6c9', text: '#1b5e20' }; // Verde suave
    if (['CELULAR', 'TABLET', 'RELOGIO', 'NOTEBOOK'].some(x => t.includes(x)))
        return { bg: '#e1f5fe', text: '#01579b' }; // Azul suave
    return { bg: '#f5f5f5', text: '#424242' };     // Cinza padrão
};

// --- FUNÇÃO DE COPIAR AGENDAMENTOS
window.copiarAgendamentosSelecionados = () => {
    const selecionados = Array.from(document.querySelectorAll('.check-export:checked'));
    if (selecionados.length === 0) return alert("Selecione os agendamentos na tabela!");

    let html = `
        <table style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px; color: #000000; width: auto;">
            <thead>
                <tr>
                    <th style="border: 1px solid #000000; padding: 6px 12px; background-color: #b4c6e7; text-align: center; font-weight: bold;">SENHA</th>
                    <th style="border: 1px solid #000000; padding: 6px 12px; text-align: center; font-weight: bold;">DATA</th>
                    <th style="border: 1px solid #000000; padding: 6px 12px; text-align: center; font-weight: bold;">CENTRAL</th>
                    <th style="border: 1px solid #000000; padding: 6px 12px; text-align: center; font-weight: bold;">CARGA</th>
                    <th style="border: 1px solid #000000; padding: 6px 12px; text-align: center; font-weight: bold;">NOTAS</th>
                </tr>
            </thead>
            <tbody>
    `;

    selecionados.forEach(cb => {
        const tr = cb.closest('tr');
        const senha = tr.cells[1] ? tr.cells[1].innerText.trim() : "";
        const data = tr.cells[2] ? tr.cells[2].innerText.trim() : "";
        const central = tr.cells[3] ? tr.cells[3].innerText.trim() : "";
        const cargas = tr.cells[4] ? tr.cells[4].innerText.trim() : "";
        
        // 1. Tenta pegar a célula de notas (Ajuste para o índice correto, ex: tr.cells[5] para a 6ª coluna)
        const celulaNotas = tr.cells[6] || tr.cells[7]; 
        let textoNotas = "";

        if (celulaNotas) {
            // Se houver um input/textarea dentro da célula, pega o .value
            const inputElement = celulaNotas.querySelector('input, textarea');
            if (inputElement) {
                textoNotas = inputElement.value.trim();
            } else {
                textoNotas = celulaNotas.innerText.trim();
            }
        }

        const notas = textoNotas !== "" ? textoNotas : "PENDENTE";

        html += `
            <tr>
                <td style="border: 1px solid #000000; padding: 6px 12px; background-color: #b4c6e7; text-align: center;">${senha}</td>
                <td style="border: 1px solid #000000; padding: 6px 12px; text-align: center;">${data}</td>
                <td style="border: 1px solid #000000; padding: 6px 12px; text-align: center; text-transform: uppercase;">${central}</td>
                <td style="border: 1px solid #000000; padding: 6px 12px; text-align: center; text-transform: uppercase;">CARGA : ${cargas}</td>
                <td style="border: 1px solid #000000; padding: 6px 12px; text-align: center; text-transform: uppercase;">${notas}</td>
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

window.selecionarTudoFiltro = (status) => {
    const checkboxes = document.querySelectorAll('#opcoesFiltro input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = status);
};
