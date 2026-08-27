import { app } from './firebase-config.js';
import { 
    getFirestore, collection, onSnapshot, query, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const db = getFirestore(app);

// --- CONTROLE DE ACESSO SEGURO (Liberado para ADM, LOGISTICA e LEITOR) ---
const nivelAcessoRaw = localStorage.getItem('nivelAcesso') || ""; 
const usuarioNome = localStorage.getItem('username') || "Usuário";
const nivelAcesso = nivelAcessoRaw.toUpperCase().trim();

const niveisPermitidos = ["ADM", "LOGISTICA", "LEITOR"];

if (!nivelAcesso || !niveisPermitidos.includes(nivelAcesso)) {
    console.error("Acesso negado! Nível lido:", nivelAcesso);
    window.location.replace("index.html");
}

document.addEventListener('DOMContentLoaded', () => {
    const display = document.getElementById('txtUser');
    if (display) {
        display.innerText = usuarioNome.toUpperCase();
    }
});

// --- ESTADO GLOBAL ---
let dadosOriginais = [];
let dadosFiltrados = [];
let paginaAtual = 1;
let itensPorPagina = 50;
let colunaFiltroAtual = '';
let ordemCrescente = true; 
let ultimaColuna = '';

const dataHojeBrasil = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
let filtrosSelecionados = {
    'data': [dataHojeBrasil]
};

document.addEventListener('DOMContentLoaded', () => {
    escutarDadosFirebase();
});

// --- BUSCA EM TEMPO REAL ---
function escutarDadosFirebase() {
    const q = query(collection(db, "agendamentos"));
    
    onSnapshot(q, (querySnapshot) => {
        dadosOriginais = [];
        querySnapshot.forEach((doc) => {
            dadosOriginais.push({ id: doc.id, ...doc.data() });
        });
        aplicarFiltrosEBusca();
    });
}

window.renderizarTabela = function() {
    const corpo = document.getElementById('corpoTabela');
    corpo.innerHTML = '';

    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    const listaExibicao = dadosFiltrados.slice(inicio, fim);

    const getClasseTipo = (tipo) => {
        const t = (tipo || "").toUpperCase();
        if (['ARMARIO','COMODA','PAINEL','MULTIUSO','MODULO','COZINHA','ROUPEIRO'].some(x => t.includes(x))) return 'tipo-amarelo';
        if (t.includes('MESA')) return 'tipo-verde';
        if (['CELULAR','TABLET','RELOGIO','NOTEBOOK'].some(x => t.includes(x))) return 'tipo-azul';
        return 'tipo-padrao';
    };

    listaExibicao.forEach(item => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td><input type="checkbox" class="check-export" value="${item.id}"></td>
            <td style="font-weight:bold; color:var(--primary)">${item.senhaAgendamento || '-'}</td>
            <td>
                <button onclick="abrirModalData('${item.data}')" style="border:none; background:none; cursor:pointer; color:var(--primary); font-weight:bold; font-size:13px;">
                    <i class="far fa-calendar-alt" style="margin-right: 4px;"></i>
                    ${formatarData(item.data)}
                </button>
            </td>
            <td>${item.central || '-'}</td>
            <td>${item.cargas || '-'}</td>
            
            <td style="font-weight: 500;">${item.pedido || '-'}</td>
            <td style="font-style: italic; color: #555; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.notas || '-'}</td>
            <td>${renderizarBadgeSituacao(item.situacao)}</td>
            
            <td style="text-align:left">${item.fornecedor || '-'}</td>
            <td><span class="${getClasseTipo(item.tipoProduto)}">${item.tipoProduto || '-'}</span></td>
            <td>${item.linhaSeparacao || '-'}</td>
            <td>
                <button onclick="abrirComposicao('${item.id}')" style="border:none; background:none; cursor:pointer; color:#1565c0; padding: 6px;">
                    <i class="fas fa-eye" style="font-size: 16px;"></i>
                </button>
            </td>
        `;
        corpo.appendChild(tr);
    });

    atualizarControlesPaginacao();
};

function renderizarBadgeSituacao(situacao) {
    const s = situacao || 'AGUARDANDO';
    const cores = {
        'AGUARDANDO': { bg: '#424242', text: '#ffffff' },
        'OK NO AJUSTE': { bg: '#066b3c', text: '#ffffff' },
        'SEM NOTA': { bg: '#0d47a1', text: '#ffffff' },
        'REAGENDADA': { bg: '#e1bee7', text: '#4a148c' },
        'SOBRE AJUSTE': { bg: '#ffe082', text: '#5f4b00' },
        'CANCELADA': { bg: '#b71c1c', text: '#ffffff' },
        'OC PENDENTE': { bg: '#cfd8dc', text: '#37474f' },
        'SEM TRIANGULACAO': { bg: '#ffcdd2', text: '#b71c1c' },
        'VENCIMENTO ERRADO': { bg: '#b71c1c', text: '#ffffff', border: 'outline: 2px solid #ffd600;' },
        'FALTA CTE': { bg: '#512da8', text: '#ffffff' },
        'NOTA ERRADA': { bg: '#ffccbc', text: '#e64a19' },
        'CTE DIVERGENTE': { bg: '#795548', text: '#ffffff' }
    };

    const estilo = cores[s] || { bg: '#424242', text: '#ffffff' };
    const borderExtra = estilo.border || '';
    return `<span class="badge-situacao" style="background:${estilo.bg}; color:${estilo.text}; ${borderExtra}">${s}</span>`;
}

// --- FILTROS E BUSCA ---
window.atualizarFiltros = function() {
    aplicarFiltrosEBusca();
};

function aplicarFiltrosEBusca() {
    const termoBusca = document.getElementById('inputBusca').value.toLowerCase();
    
    dadosFiltrados = dadosOriginais.filter(item => {
        const matchCamposNormais = Object.values(item).some(val => 
            String(val).toLowerCase().includes(termoBusca)
        );

        const matchComposicao = item.composicao?.some(prod => 
            String(prod.codigo).toLowerCase().includes(termoBusca) || 
            String(prod.descricao).toLowerCase().includes(termoBusca)
        );

        const matchBusca = matchCamposNormais || matchComposicao;
        
        const matchFiltros = Object.keys(filtrosSelecionados).every(coluna => {
            const selecionadosNaColuna = filtrosSelecionados[coluna];
            if (!selecionadosNaColuna || selecionadosNaColuna.length === 0) return true;
            
            const valorParaComparar = (coluna === 'data') 
                ? formatarData(item[coluna]) 
                : String(item[coluna] || '').trim(); // <--- .trim() adicionado aqui

            return selecionadosNaColuna.includes(valorParaComparar);
        });

        return matchBusca && matchFiltros;
    });

    atualizarVisualFiltros(); 
    paginaAtual = 1;
    renderizarTabela();
}

function atualizarVisualFiltros() {
    const colunasComFiltro = Object.keys(filtrosSelecionados).filter(col => filtrosSelecionados[col].length > 0);

    document.querySelectorAll('.btn-abrir-filtro').forEach(btn => {
        btn.style.background = 'none';
        btn.style.color = 'inherit';
        btn.innerHTML = 'FILTRO';
    });

    colunasComFiltro.forEach(coluna => {
        const btn = document.getElementById(`filter-${coluna}`);
        if (btn) {
            btn.style.background = '#ffeb3b'; 
            btn.style.color = '#000';
            btn.style.padding = '2px 6px';
            btn.style.borderRadius = '4px';
            btn.style.fontSize = '9px';
            btn.innerHTML = 'APLICADO';
        }
    });
}

// --- ARVORE DE FILTROS EXCEL ---
window.abrirFiltro = function(coluna, event) {
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

        // 1. Anos em ordem (ex: 2026, 2027)
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

            // 2. Meses em ORDEM CRESCENTE (1 a 12 -> Janeiro a Dezembro)
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

                // 3. Dias em ORDEM CRESCENTE (1 a 31)
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
        // 1. Extrai todos os valores, aplica .trim() para ignorar espaços extras e remove duplicados usando Set
        const todosValoresUnicos = [...new Set(
            dadosOriginais.map(item => String(item[coluna] || '').trim())
        )].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

        // 2. Extrai os valores vivos (filtrados atuais) também normalizados com .trim()
        const valoresVivos = [...new Set(
            dadosFiltrados.map(item => String(item[coluna] || '').trim())
        )];
        
        container.innerHTML = todosValoresUnicos.map(valor => {
            const estaVivo = valoresVivos.includes(valor);
            
            // Verifica se o valor limpo (ou o original) está marcado no filtro selecionado
            const estaChecado = filtrosSelecionados[coluna]?.some(f => f.trim() === valor);
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

window.aplicarFiltroColuna = function() {
    const selecionados = Array.from(document.querySelectorAll('.check-item-filtro:checked')).map(cb => cb.value);
    filtrosSelecionados[colunaFiltroAtual] = selecionados;
    fecharModais();
    aplicarFiltrosEBusca();
};

// --- PAGINAÇÃO E CONTROLES ---
window.fecharModais = function() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
};

window.atualizarControlesPaginacao = function() {
    const totalItens = dadosFiltrados.length;
    const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1;
    
    const info = document.getElementById('infoPaginacao');
    if (info) info.innerText = `Mostrando ${totalItens} registros (Página ${paginaAtual} de ${totalPaginas})`;
    
    const numPagina = document.getElementById('numeroPaginaAtiva');
    if (numPagina) numPagina.innerText = paginaAtual;

    const btnAnterior = document.querySelector("button[onclick*='anterior']");
    const btnProximo = document.querySelector("button[onclick*='proximo']");
    
    if (btnAnterior) btnAnterior.disabled = (paginaAtual === 1);
    if (btnProximo) btnProximo.disabled = (paginaAtual === totalPaginas);
};

window.mudarTamanhoPagina = function(valor) {
    itensPorPagina = parseInt(valor);
    paginaAtual = 1;
    renderizarTabela();
};

window.mudarPagina = function(direcao) {
    const totalPaginas = Math.ceil(dadosFiltrados.length / itensPorPagina);
    if (direcao === 'proximo' && paginaAtual < totalPaginas) paginaAtual++;
    else if (direcao === 'anterior' && paginaAtual > 1) paginaAtual--;
    renderizarTabela();
};

window.ordenarTabela = function(coluna) {
    if (ultimaColuna === coluna) {
        ordemCrescente = !ordemCrescente;
    } else {
        ordemCrescente = true;
        ultimaColuna = coluna;
    }

    dadosFiltrados.sort((a, b) => {
        let valA = String(a[coluna] || "").toLowerCase();
        let valB = String(b[coluna] || "").toLowerCase();
        
        if (coluna === 'data') {
            return ordemCrescente ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (valA < valB) return ordemCrescente ? -1 : 1;
        if (valA > valB) return ordemCrescente ? 1 : -1;
        return 0;
    });
    renderizarTabela();
};

// --- VISUALIZAR COMPOSIÇÃO ---
window.abrirComposicao = async function(id) {
    const docSnap = await getDoc(doc(db, "agendamentos", id));
    if (docSnap.exists()) {
        const dados = docSnap.data();
        const modal = document.getElementById('modalComposicao');
        const container = document.getElementById('detalhesItens');
        const titulo = document.getElementById('tituloComp');

        titulo.innerText = `Detalhes: ${dados.senhaAgendamento || 'N/A'}`;

        if (dados.composicao && dados.composicao.length > 0) {
            const totalQtd = dados.composicao.reduce((acc, item) => acc + (Number(item.qtd) || 0), 0);

            container.innerHTML = `
                <div style="overflow-x: auto; max-height: 400px;">
                    <table style="width:100%; border-collapse: collapse; font-family: sans-serif; font-size: 13px; min-width: 100%;">
                        <thead>
                            <tr style="background: #c00000; color: white;">
                                <th style="padding:12px; border: 1px solid #ddd;">CÓDIGO</th>
                                <th style="padding:12px; border: 1px solid #ddd;">DESCRIÇÃO</th>
                                <th style="padding:12px; border: 1px solid #ddd;">QTD</th>
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

// --- FUNÇÃO PARA VISUALIZAR A DATA NO MODAL ---
window.abrirModalData = function(dataBruta) {
    if (!dataBruta) return;

    const [ano, mes, dia] = dataBruta.split('-');
    const dataFormatada = `${dia}/${mes}/${ano}`;
    
    // Nomes dos meses para exibição detalhada
    const meses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const nomeMes = meses[parseInt(mes, 10) - 1] || mes;

    // Se você já possui um modal genérico/específico de data no seu HTML:
    const modal = document.getElementById('modalData') || document.getElementById('modalComposicao');
    const container = document.getElementById('detalhesData') || document.getElementById('detalhesItens');
    const titulo = document.getElementById('tituloData') || document.getElementById('tituloComp');

    if (titulo) titulo.innerText = `Data do Agendamento`;

    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; font-family: sans-serif;">
                <div style="font-size: 3rem; color: #c00000; margin-bottom: 5px;">
                    <i class="far fa-calendar-alt"></i>
                </div>
                <h2 style="margin: 5px 0; color: #333; font-size: 1.8rem;">${dataFormatada}</h2>
                <p style="margin: 0; color: #666; font-size: 1.1rem; font-weight: 500;">
                    ${dia} de ${nomeMes} de ${ano}
                </p>
            </div>
        `;
    }

    if (modal) modal.style.display = 'flex';
};

// --- EXPORTAÇÕES E AUXILIARES (Inalterados) ---
function formatarData(data) {
    if (!data) return '-';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
}

window.marcarTodos = function(masterCheckbox) {
    const checkboxes = document.querySelectorAll('#corpoTabela input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
};

window.selecionarTudoFiltro = (status) => {
    const checkboxes = document.querySelectorAll('#opcoesFiltro input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = status);
};

const getCoresPorTipoCard = (tipo) => {
    const t = (tipo || "").toUpperCase();
    if (['ARMARIO','COMODA','PAINEL','MULTIUSO','MODULO','COZINHA','ROUPEIRO'].some(x => t.includes(x))) return { bg: '#fff9c4', text: '#827717' };
    if (t.includes('MESA')) return { bg: '#c8e6c9', text: '#1b5e20' };
    if (['CELULAR','TABLET','RELOGIO','NOTEBOOK'].some(x => t.includes(x))) return { bg: '#e1f5fe', text: '#01579b' };
    return { bg: '#f5f5f5', text: '#424242' };
};

window.copiarAgendamentosSelecionados = () => {
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

window.exportarPDF = async (modo) => {
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF('p', 'mm', 'a4');
    
    const getCoresPorTipo = (tipo) => {
        const t = (tipo || "").toUpperCase();
        if (['ARMARIO','COMODA','PAINEL','MULTIUSO','MODULO','COZINHA','ROUPEIRO'].some(x => t.includes(x))) 
            return { rgb: [255, 255, 0], text: [0, 0, 0] };
        if (t.includes('MESA')) 
            return { rgb: [76, 175, 80], text: [255, 255, 255] };
        if (['CELULAR','TABLET','RELOGIO','NOTEBOOK'].some(x => t.includes(x))) 
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
                styles: { fontSize: 7, halign: 'center', cellPadding: 2, lineColor: [0,0,0], lineWidth: 0.1 },
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
            styles: { fontSize: 7, halign: 'center', cellPadding: 2, lineColor: [0,0,0], lineWidth: 0.1 },
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
        if (['ARMARIO','COMODA','PAINEL','MULTIUSO','MODULO','COZINHA','ROUPEIRO'].some(x => t.includes(x))) 
            return { fg: 'FFFF00', txt: '000000' }; 
        if (t.includes('MESA')) 
            return { fg: '4CAF50', txt: 'FFFFFF' }; 
        if (['CELULAR','TABLET','RELOGIO','NOTEBOOK'].some(x => t.includes(x))) 
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
