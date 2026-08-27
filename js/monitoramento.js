import { app } from './firebase-config.js';
import { getFirestore, collection, query, onSnapshot, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const db = getFirestore(app);

// --- ESTADOS GLOBAIS ---
let dadosMestres = [];
let dadosFiltrados = [];
let filtrosAtivos = { 
    senhaAgendamento: [], 
    data: [], 
    central: [], 
    cargas: [],
    fornecedor: [], 
    tipoProduto: [],
    linhaSeparacao: [] // ADICIONE ESTA LINHA
};
let colunaFiltroAtual = "";

let paginaAtual = 1;
let registrosPorPagina = 50;
let ordenacao = { coluna: 'data', direcao: 'desc' };

// --- 1. INICIALIZAÇÃO ---
function init() {
    const userDisplay = document.getElementById('txtUser');
    if(userDisplay) userDisplay.innerText = localStorage.getItem('username') || "D. BRITO";
    
    const q = query(collection(db, "agendamentos"), orderBy("data", "desc"));
    
    onSnapshot(q, (snapshot) => {
        dadosMestres = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(item => item.status !== "Rascunho");

        // --- TRECHO AJUSTADO DAQUI ---
        // Obtém a data de hoje ajustada perfeitamente ao fuso horário local (Brasil YYYY-MM-DD)
        const offset = new Date().getTimezoneOffset() * 60000;
        const hoje = new Date(Date.now() - offset).toISOString().split('T')[0];
        
        // Ativa o filtro se nenhum outro filtro de coluna estiver ativo no momento
        if (Object.values(filtrosAtivos).every(v => v.length === 0)) {
            filtrosAtivos.data = [hoje];
        }
        // --- ATÉ AQUI ---

        window.atualizarFiltros();
    });
}

// --- 2. LÓGICA DE FILTROS ---
window.atualizarFiltros = () => {
    // Reset da seleção global ao aplicar novos filtros
    todosSelecionadosGlobal = false;
    const chkMaster = document.querySelector('thead input[type="checkbox"]');
    if (chkMaster) chkMaster.checked = false;
    
    const termo = document.getElementById('inputBusca')?.value.toLowerCase() || "";

    dadosFiltrados = dadosMestres.filter(item => {
        // Validação das Colunas (Filtro Inteligente)
        const atendeColunas = Object.keys(filtrosAtivos).every(col => {
            if (!filtrosAtivos[col] || filtrosAtivos[col].length === 0) return true;
            return filtrosAtivos[col].includes(String(item[col] || "").trim());
        });

        // Busca Geral
        const compStr = item.composicao ? JSON.stringify(item.composicao).toLowerCase() : "";
        const atendeBusca = (JSON.stringify(item).toLowerCase() + compStr).includes(termo);

        return atendeColunas && atendeBusca;
    });

    atualizarIndicadoresVisuais();
    paginaAtual = 1;
    renderizarTabela();
};

function atualizarIndicadoresVisuais() {
    // Lista de todas as colunas que possuem filtro
    const colunas = ['senhaAgendamento', 'data', 'central', 'cargas', 'fornecedor', 'tipoProduto', 'linhaSeparacao'];

    colunas.forEach(col => {
        const btn = document.getElementById(`btn-filter-${col}`);
        if (btn) {
            if (filtrosAtivos[col] && filtrosAtivos[col].length > 0) {
                // Estilo quando o filtro está ATIVO
                btn.innerText = 'APLICADO';
                btn.style.backgroundColor = '#fff176'; // Amarelo
                btn.style.color = '#333';
                btn.style.padding = '2px 6px';
                btn.style.borderRadius = '4px';
                btn.style.fontWeight = 'bold';
                btn.style.border = '1px solid #fbc02d';
            } else {
                // Estilo PADRÃO
                btn.innerText = 'FILTRO';
                btn.style.backgroundColor = 'transparent';
                btn.style.color = 'inherit';
                btn.style.border = 'none';
                btn.style.fontWeight = 'normal';
                btn.style.padding = '0';
            }
        }
    });
}

// --- 3. RENDERIZAÇÃO ---
function renderizarTabela() {
    const tbody = document.getElementById('corpoTabela');
    if(!tbody) return;

    const dadosOrdenados = [...dadosFiltrados].sort((a, b) => {
        let valA = a[ordenacao.coluna] || "";
        let valB = b[ordenacao.coluna] || "";
        return ordenacao.direcao === 'asc' 
            ? valA.toString().localeCompare(valB.toString(), undefined, {numeric: true}) 
            : valB.toString().localeCompare(valA.toString(), undefined, {numeric: true});
    });

    const inicio = (paginaAtual - 1) * registrosPorPagina;
    const dadosPaginados = dadosFiltrados.slice(inicio, inicio + registrosPorPagina);
    
    tbody.innerHTML = "";
    dadosPaginados.forEach(item => {
        const dataBR = item.data ? item.data.split('-').reverse().join('/') : '---';
        const tipo = (item.tipoProduto || "").toLowerCase();

        const isChecked = todosSelecionadosGlobal ? 'checked' : '';
        
        const tr = document.createElement('tr');
        const cores = getCoresPorTipo(item.tipoProduto);
        tr.innerHTML = `
            <td><input type="checkbox" class="row-check" value="${item.id}" ${isChecked}></td>
            <td style="font-weight:bold">${item.senhaAgendamento || '---'}</td>
            <td>${dataBR}</td>
            <td>${item.central || '---'}</td>
            <td>${item.cargas || 1}</td>
            <td>${item.fornecedor || '---'}</td>
            <td style="background-color: rgb(${cores.rgb.join(',')}); color: rgb(${cores.text.join(',')}); font-weight: bold;">
                ${item.tipoProduto || '---'}
            </td>
            <td style="font-weight: bold;">${item.linhaSeparacao || '-'}</td>
            <td>
                <button onclick="verDetalhes('${item.id}')" style="background:none; border:none; color:var(--primary); cursor:pointer;">
                    <i class="fas fa-eye fa-lg"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    atualizarControlesPaginacao();
}

// --- 4. MODAL FILTRO INTELIGENTE (ESTILO EXCEL PARA DATA) ---
window.abrirFiltro = (coluna) => {
    colunaFiltroAtual = coluna;
    document.getElementById('nomeColunaFiltro').innerText = `Filtrar: ${coluna.toUpperCase()}`;
    const container = document.getElementById('opcoesFiltro');

    // Lógica Inteligente: Vê o que restou baseado nos OUTROS filtros aplicados
    const dadosParaOpcoes = dadosMestres.filter(item => {
        return Object.keys(filtrosAtivos).every(col => {
            if (col === coluna || filtrosAtivos[col].length === 0) return true;
            return filtrosAtivos[col].includes(String(item[col] || "").trim());
        });
    });

    const todosValores = [...new Set(dadosMestres.map(d => String(d[coluna] || "").trim()))].sort();
    const valoresDisponiveis = new Set(dadosParaOpcoes.map(d => String(d[coluna] || "").trim()));

    // --- SE FOR A COLUNA DE DATA: RENDERIZA EM ÁRVORE (ESTILO EXCEL) ---
    if (coluna === 'data') {
        // Objeto para estruturar Ano -> Mês -> Dia
        const estrutura = {};

        todosValores.forEach(dataIso => {
            if (!dataIso || dataIso === "---") return;
            
            // Garantindo que a quebra da data respeite o fuso do Brasil
            const [ano, mes, dia] = dataIso.split('-');
            const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            const mesNome = nomeMeses[parseInt(mes, 10) - 1];

            if (!estrutura[ano]) estrutura[ano] = {};
            if (!estrutura[ano][mesNome]) estrutura[ano][mesNome] = [];
            
            estrutura[ano][mesNome].push({ dia: parseInt(dia, 10).toString(), valorOriginal: dataIso });
        });

        let htmlArvore = `<div class="filter-tree-root">`;

        // Loop dos Anos
        Object.keys(estrutura).sort((a, b) => b - a).forEach(ano => {
            const checkedAno = estrutura[ano];
            htmlArvore += `
                <div class="filter-tree-group">
                    <div class="filter-tree-item">
                        <span class="filter-tree-toggle" onclick="window.toggleNodeTree(this)"><i class="fas fa-chevron-right"></i></span>
                        <label><input type="checkbox" class="chk-tree-ano" value="${ano}"> ${ano}</label>
                    </div>
                    <div class="filter-tree-node">`;

            // Loop dos Meses
            Object.keys(estrutura[ano]).forEach(mes => {
                htmlArvore += `
                    <div class="filter-tree-item" style="margin-left: 15px;">
                        <span class="filter-tree-toggle" onclick="window.toggleNodeTree(this)"><i class="fas fa-chevron-right"></i></span>
                        <label><input type="checkbox" class="chk-tree-mes" data-ano="${ano}" value="${mes}"> ${mes}</label>
                    </div>
                    <div class="filter-tree-node" style="margin-left: 15px;">`;

                // Loop dos Dias
                estrutura[ano][mes].sort((a,b) => a.dia - b.dia).forEach(itemDia => {
                    const isDisponivel = valoresDisponiveis.has(itemDia.valorOriginal);
                    const isChecked = filtrosAtivos.data.includes(itemDia.valorOriginal);

                    htmlArvore += `
                        <div class="filter-tree-item" style="margin-left: 30px; ${!isDisponivel ? 'opacity: 0.5; font-style: italic;' : ''}">
                            <span class="filter-tree-toggle"></span>
                            <label>
                                <input type="checkbox" class="chk-filtro" data-ano="${ano}" data-mes="${mes}" value="${itemDia.valorOriginal}" ${isChecked ? 'checked' : ''}> 
                                ${itemDia.dia} ${!isDisponivel ? '<small>(Sem registros)</small>' : ''}
                            </label>
                        </div>`;
                });

                htmlArvore += `</div>`; // Fecha nó do mês
            });

            htmlArvore += `</div></div>`; // Fecha nó do ano e grupo
        });

        htmlArvore += `</div>`;
        container.innerHTML = htmlArvore;

        // Atualiza os estados dos checkboxes pais (Ano/Mês) baseando-se nos filhos marcados
        window.atualizarChecksPais();
        window.configurarEventosArvore();

    } else {
        // --- COMPORTAMENTO PADRÃO DO SEU SISTEMA PARA AS OUTRAS COLUNAS ---
        container.innerHTML = todosValores.map(val => {
            const isDisponivel = valoresDisponiveis.has(val);
            const isChecked = filtrosAtivos[coluna].includes(val);
            
            return `
                <div style="padding:5px 0;" class="${!isDisponivel ? 'option-disabled' : ''}">
                    <label style="cursor:pointer; display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" class="chk-filtro" value="${val}" ${isChecked ? 'checked' : ''}> 
                        <span>${val}</span>
                        ${!isDisponivel ? '<small>(Sem registros p/ filtros atuais)</small>' : ''}
                    </label>
                </div>
            `;
        }).join('');
    }

    document.getElementById('modalFiltro').style.display = "flex";
};

// Funções auxiliares para controle da Árvore de Data
window.toggleNodeTree = (el) => {
    const node = el.parentElement.nextElementSibling;
    const icon = el.querySelector('i');
    if (node && node.classList.contains('filter-tree-node')) {
        if (node.style.display === 'block') {
            node.style.display = 'none';
            if(icon) icon.className = 'fas fa-chevron-right';
        } else {
            node.style.display = 'block';
            if(icon) icon.className = 'fas fa-chevron-down';
        }
    }
};

window.configurarEventosArvore = () => {
    // Evento ao clicar em um Ano
    document.querySelectorAll('.chk-tree-ano').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const grupo = e.target.closest('.filter-tree-group');
            grupo.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = e.target.checked);
        });
    });

    // Evento ao clicar em um Mês
    document.querySelectorAll('.chk-tree-mes').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const item = e.target.closest('.filter-tree-item');
            const noFilho = item.nextElementSibling;
            if (noFilho) {
                noFilho.querySelectorAll('.chk-filtro').forEach(c => c.checked = e.target.checked);
            }
            window.atualizarChecksPais();
        });
    });

    // Evento ao clicar em um Dia (chk-filtro)
    document.querySelectorAll('.chk-filtro').forEach(chk => {
        chk.addEventListener('change', () => {
            window.atualizarChecksPais();
        });
    });
};

window.atualizarChecksPais = () => {
    if (colunaFiltroAtual !== 'data') return;

    // Verificar Meses com base nos Dias
    document.querySelectorAll('.chk-tree-mes').forEach(chkMes => {
        const noDias = chkMes.closest('.filter-tree-item').nextElementSibling;
        const totalDias = noDias.querySelectorAll('.chk-filtro').length;
        const marcadosDias = noDias.querySelectorAll('.chk-filtro:checked').length;
        
        chkMes.checked = (totalDias === marcadosDias && totalDias > 0);
        chkMes.indeterminate = (marcadosDias > 0 && marcadosDias < totalDias);
    });

    // Verificar Anos com base nos Meses e Dias
    document.querySelectorAll('.chk-tree-ano').forEach(chkAno => {
        const grupo = chkAno.closest('.filter-tree-group');
        const totalDias = grupo.querySelectorAll('.chk-filtro').length;
        const marcadosDias = grupo.querySelectorAll('.chk-filtro:checked').length;

        chkAno.checked = (totalDias === marcadosDias && totalDias > 0);
        chkAno.indeterminate = (marcadosDias > 0 && marcadosDias < totalDias);
    });
};

window.marcarTodosFiltro = (status) => {
    document.querySelectorAll('#opcoesFiltro input[type="checkbox"]').forEach(chk => {
        chk.checked = status;
        chk.indeterminate = false;
    });
};

window.aplicarFiltroColuna = () => {
    // Pegamos os inputs com a classe 'chk-filtro' (que guardam os valores ISO reais das datas ou das outras colunas)
    const chks = document.querySelectorAll('.chk-filtro');
    const marcados = Array.from(document.querySelectorAll('.chk-filtro:checked')).map(c => c.value);
    
    if (marcados.length === 0 || marcados.length === chks.length) {
        filtrosAtivos[colunaFiltroAtual] = [];
    } else {
        filtrosAtivos[colunaFiltroAtual] = marcados;
    }

    window.atualizarFiltros();
    window.fecharModais();
};

let ordemAtual = { coluna: 'data', direcao: 'desc' }; // Começa por data desc

window.ordenarTabela = (coluna, el) => {
    // 1. Alternar direção
    if (ordemAtual.coluna === coluna) {
        ordemAtual.direcao = ordemAtual.direcao === 'asc' ? 'desc' : 'asc';
    } else {
        ordemAtual.coluna = coluna;
        ordemAtual.direcao = 'asc';
    }

    // 2. Lógica de comparação robusta
    dadosFiltrados.sort((a, b) => {
        let valA = a[coluna];
        let valB = b[coluna];

        // Tratar valores nulos/vazios para ficarem sempre no fim
        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';

        // Comparação de Números (ex: cargas)
        if (typeof valA === 'number' && typeof valB === 'number') {
            return ordemAtual.direcao === 'asc' ? valA - valB : valB - valA;
        }

        // Comparação de Strings / Datas ISO (YYYY-MM-DD funciona com localeCompare)
        // Usamos numeric: true para que "Senha 10" venha depois de "Senha 2"
        const comparacao = String(valA).localeCompare(String(valB), undefined, { 
            numeric: true, 
            sensitivity: 'base' 
        });

        return ordemAtual.direcao === 'asc' ? comparacao : -comparacao;
    });

    // 3. Feedback Visual nos ícones
    atualizarIconesOrdenacao(el);

    renderizarTabela();
};

function atualizarIconesOrdenacao(elementoClicado) {
    // Reseta todos os ícones das THs para o estado neutro
    document.querySelectorAll('thead th i.fas.fa-sort, i.fas.fa-sort-up, i.fas.fa-sort-down').forEach(icon => {
        icon.className = 'fas fa-sort';
        icon.style.opacity = "0.5";
    });

    // Destaca o ícone da coluna atual
    const icon = elementoClicado.querySelector('i.fas');
    if (icon) {
        icon.className = ordemAtual.direcao === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        icon.style.opacity = "1";
    }
}

// --- 5. DETALHES ---
window.verDetalhes = (id) => {
    const item = dadosMestres.find(d => d.id === id);
    if(!item) return;

    document.getElementById('tituloComp').innerText = `Detalhes: ${item.senhaAgendamento}`;
    const container = document.getElementById('detalhesItens');

    let totalQtd = 0;
    let tabela = `
        <table style="width:100%; border-collapse:collapse; min-width:600px;">
            <thead style="background:#f4f4f4;">
                <tr><th style="padding:12px;">CÓDIGO</th><th style="padding:12px;">DESCRIÇÃO</th><th style="padding:12px;">QTD</th></tr>
            </thead>
            <tbody>`;

    if(item.composicao) {
        item.composicao.forEach(prod => {
            const q = parseInt(prod.qtd || prod.quantidade || 0);
            totalQtd += q;
            tabela += `
                <tr>
                    <td style="border-bottom:1px solid #eee; padding:10px; text-align:center;">${prod.codigo}</td>
                    <td style="border-bottom:1px solid #eee; padding:10px;">${prod.descricao}</td>
                    <td style="border-bottom:1px solid #eee; padding:10px; text-align:center; font-weight:bold; color:red;">${q}</td>
                </tr>`;
        });
    }

    tabela += `
            <tr style="background:#f9f9f9; font-weight:bold;">
                <td colspan="2" style="padding:12px; text-align:right;">TOTAL:</td>
                <td style="padding:12px; text-align:center; color:red;">${totalQtd}</td>
            </tr>
        </tbody></table>`;

    container.innerHTML = tabela;
    document.getElementById('modalComposicao').style.display = "flex";
};

// --- 6. UTILITÁRIOS PAGINAÇÃO ---
function atualizarControlesPaginacao() {
    const totalPaginas = Math.ceil(dadosFiltrados.length / registrosPorPagina);
    const container = document.getElementById('botoesPagina');
    const info = document.getElementById('infoPagina');
    
    info.innerText = `Mostrando ${dadosFiltrados.length > 0 ? (paginaAtual - 1) * registrosPorPagina + 1 : 0} até ${Math.min(paginaAtual * registrosPorPagina, dadosFiltrados.length)} de ${dadosFiltrados.length}`;

    container.innerHTML = `<button class="btn-page" ${paginaAtual === 1 ? 'disabled' : ''} onclick="irParaPagina(${paginaAtual - 1})">Anterior</button>`;
    for(let i = 1; i <= totalPaginas; i++) {
        if(i === 1 || i === totalPaginas || (i >= paginaAtual - 2 && i <= paginaAtual + 2)) {
            container.innerHTML += `<button class="btn-page ${i === paginaAtual ? 'active' : ''}" onclick="irParaPagina(${i})">${i}</button>`;
        }
    }
    container.innerHTML += `<button class="btn-page" ${paginaAtual === totalPaginas ? 'disabled' : ''} onclick="irParaPagina(${paginaAtual + 1})">Próximo</button>`;
}

window.irParaPagina = (p) => { paginaAtual = p; renderizarTabela(); };
window.mudarTamanhoPagina = () => {
    registrosPorPagina = parseInt(document.getElementById('selectPageSize').value);
    paginaAtual = 1;
    renderizarTabela();
};
window.fecharModais = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
};

// --- ESTADO DE SELEÇÃO GLOBAL ---
let todosSelecionadosGlobal = false;

window.marcarTodos = (el) => {
    // Guarda o estado global do checkbox do cabeçalho
    todosSelecionadosGlobal = el.checked;
    
    // Marca/desmarca os checkboxes visíveis na página atual
    const checkboxes = document.querySelectorAll('#corpoTabela .row-check');
    checkboxes.forEach(chk => chk.checked = el.checked);
};

// --- FUNÇÃO PARA OBTER IDS SELECIONADOS EM TODAS AS PÁGINAS ---
const obterIDsSelecionados = () => {
    if (todosSelecionadosGlobal) {
        // Retorna TODOS os IDs do período/filtro atual (todas as páginas)
        return dadosFiltrados.map(d => d.id);
    }
    // Retorna apenas os checkboxes marcados manualmente na página visível
    return Array.from(document.querySelectorAll('.row-check:checked')).map(c => c.value);
};

// --- 7. EXPORTAÇÕES ---
const getCoresPorTipo = (tipo) => {
    const t = (tipo || "").toUpperCase();
    if (['ARMARIO','COMODA','PAINEL','MULTIUSO','MODULO','COZINHA','ROUPEIRO'].some(x => t.includes(x))) return { rgb: [255, 255, 0], hex: 'FFFF00', text: [0, 0, 0], txtHex: '000000' };
    if (t.includes('MESA')) return { rgb: [76, 175, 80], hex: '4CAF50', text: [255, 255, 255], txtHex: 'FFFFFF' };
    if (['CELULAR','TABLET','RELOGIO','NOTEBOOK'].some(x => t.includes(x))) return { rgb: [0, 191, 255], hex: '00BFFF', text: [255, 255, 255], txtHex: 'FFFFFF' };
    return { rgb: [255, 255, 255], hex: 'FFFFFF', text: [0, 0, 0], txtHex: '000000' };
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

    const selecionados = obterIDsSelecionados();
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
    docPdf.text("MÓVEIS SIMONETTI - LOGÍSTICA", 14, 16); //
    
    docPdf.setFontSize(10);
    docPdf.setTextColor(0, 0, 0);
    docPdf.text(`TOTAL DE AGENDAS: ${agendas.length}`, 14, 32);
    docPdf.setTextColor(100);
    docPdf.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 145, 32); //

    let currentY = 38;

    if (modo === 'completo') {
        // --- LÓGICA PARA O PDF COMPLETO (Blocos Elegantes) ---
        agendas.forEach((ag) => {
            if (currentY > 240) { docPdf.addPage(); currentY = 20; }

            docPdf.autoTable({
                head: [['SENHA', 'DATA', 'CENTRAL', 'CARGAS', 'FORNECEDOR', 'TIPO', 'LINHA']],
                body: [[
                    ag.senhaAgendamento, 
                    ag.data.split('-').reverse().join('/'), 
                    ag.central, 
                    ag.cargas || '-', 
                    ag.fornecedor, 
                    ag.tipoProduto,
                    ag.linhaSeparacao || 'N/A'
                ]],
                startY: currentY,
                theme: 'grid',
                headStyles: { fillColor: [192, 0, 0], textColor: 255, fontSize: 8, halign: 'center' },
                styles: { fontSize: 8, halign: 'center', cellPadding: 3, lineColor: [0,0,0], lineWidth: 0.1 },
                didParseCell: (data) => {
                    if (data.section === 'body' && data.column.index === 5) {
                        const estilo = getCoresPorTipo(data.cell.raw);
                        data.cell.styles.fillColor = estilo.rgb;
                        data.cell.styles.textColor = estilo.text;
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
                currentY = docPdf.lastAutoTable.finalY + 10; // Espaço maior entre blocos
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
            ag.fornecedor,
            ag.tipoProduto,
            ag.linhaSeparacao || 'N/A'
        ]);

        docPdf.autoTable({
            head: [['SENHA', 'DATA', 'CENTRAL', 'CARGAS', 'FORNECEDOR', 'TIPO', 'LINHA']],
            body: tableBody,
            startY: currentY,
            theme: 'grid',
            headStyles: { fillColor: [192, 0, 0], textColor: 255, fontSize: 8, halign: 'center' },
            styles: { fontSize: 8, halign: 'center', cellPadding: 3, lineColor: [0,0,0], lineWidth: 0.1 },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 5) {
                    const estilo = getCoresPorTipo(data.cell.raw);
                    data.cell.styles.fillColor = estilo.rgb;
                    data.cell.styles.textColor = estilo.text;
                }
            }
        });
    }

    docPdf.save(`Relatorio_Simonetti_${modo.toUpperCase()}.pdf`);
};

window.exportarExcel = async (modo) => {
    const selecionados = obterIDsSelecionados();
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

    const columns = [
        { header: 'Senha', key: 'Senha', width: 25 },
        { header: 'Data', key: 'Data', width: 12 },
        { header: 'Central', key: 'Central', width: 15 },
        { header: 'Cargas', key: 'Cargas', width: 15 },
        { header: 'Pedido', key: 'Pedido', width: 15 },
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
    
    // Filtramos e ordenamos por data para a separação funcionar corretamente
    const agendamentosProcessados = [];
    snap.forEach(doc => {
        if (selecionados.includes(doc.id)) {
            agendamentosProcessados.push(doc.data());
        }
    });
    
    // Ordenar por data (garante que agendamentos do mesmo dia fiquem juntos)
    agendamentosProcessados.sort((a, b) => a.data.localeCompare(b.data));

    let dataAnterior = null;

    agendamentosProcessados.forEach(d => {
        const dataFormatada = d.data.split('-').reverse().join('/');
        
        // Se a data mudou e não é a primeira linha, insere linha em branco
        if (dataAnterior && dataAnterior !== dataFormatada) {
            worksheet.addRow({}); 
        }

        const base = {
            Senha: d.senhaAgendamento,
            Data: dataFormatada,
            Central: d.central,
            Cargas: d.cargas,
            Pedido: d.pedido,
            Fornecedor: d.fornecedor,
            Tipo: d.tipoProduto,
            linhaSeparacao: d.linhaSeparacao || "N/A"
        };

        if (modo === 'completo' && d.composicao && d.composicao.length > 0) {
            d.composicao.forEach(item => {
                const row = worksheet.addRow({ ...base, Cod_Item: item.codigo, Descricao: item.descricao, Qtd: item.qtd });
                aplicarEstiloCelula(row, d.tipoProduto);
            });
        } else {
            const row = worksheet.addRow(base);
            aplicarEstiloCelula(row, d.tipoProduto);
        }

        dataAnterior = dataFormatada;
    });

    // Função para aplicar bordas e cores
    function aplicarEstiloCelula(row, tipo) {
        row.eachCell({ includeEmpty: false }, (cell) => {
            // Aplicar bordas em todas as células com dados
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            
            // Centralizar dados (opcional, para ficar mais limpo)
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Aplicar cor na coluna Tipo
        const estilo = getEstiloExcel(tipo);
        const cellTipo = row.getCell('Tipo');
        cellTipo.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: estilo.fg }
        };
        cellTipo.font = { color: { argb: estilo.txt }, bold: true };
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

init();
