import { app } from './firebase-config.js';
import { getFirestore, getDocs, collection, query, onSnapshot, orderBy, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const db = getFirestore(app);

let dadosMestres = [];
let dadosFiltrados = [];
let filtrosAtivos = {
    senhaAgendamento: [], data: [], central: [], cargas: [],
    agendasituacao: [], box: [], fornecedor: [], tipoProduto: [], linhaSeparacao: []
};
let ordemAtual = { coluna: 'data', direcao: 'desc' };
let paginaAtual = 1;
const registrosPorPagina = 15;
let myChart = null;
let colunaFiltroAtual = "";

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

function init() {
    // 1. Inicializa o serviço de autenticação do Firebase
    const auth = getAuth(app);
    
    // 2. Monitora o estado de autenticação em tempo real
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Se NÃO estiver autenticado, limpa os dados e joga para a tela de login
            console.log("Usuário não autenticado. Redirecionando...");
            localStorage.clear();
            window.location.href = 'index.html';
            return;
        }

        // 3. Usuário autenticado! Vamos buscar o username na coleção 'users' do Firestore
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);
            
            let nomeExibicao = "D. BRITO"; // Nome padrão caso não encontre no banco

            if (userSnap.exists() && userSnap.data().username) {
                nomeExibicao = userSnap.data().username;
                localStorage.setItem('username', nomeExibicao); // Atualiza cache local por segurança
            } else {
                // Fallback caso o documento não exista ou não tenha o campo username
                nomeExibicao = user.displayName || user.email || nomeExibicao;
            }

            // Exibe no elemento correto correspondente ao seu HTML (userNameDisplay)
            const userDisplay = document.getElementById('userNameDisplay');
            if (userDisplay) {
                userDisplay.innerText = nomeExibicao;
            }
        } catch (error) {
            console.error("Erro ao buscar o username no Firestore:", error);
            // Fallback em caso de erro de permissão/leitura
            const userDisplay = document.getElementById('userNameDisplay');
            if (userDisplay) userDisplay.innerText = localStorage.getItem('username') || "D. BRITO";
        }

        // 4. CARREGAMENTO DOS AGENDAMENTOS (Só executa se o usuário passou pela trava acima)
        const q = query(
            collection(db, "agendamentos"), 
            where("noPainel", "==", true),
            orderBy("data", "desc")
        );
        
        onSnapshot(q, (snapshot) => {
            dadosMestres = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Filtro automático do dia removido a pedido
            window.atualizarFiltros();
        }, (error) => {
            console.error("Erro no snapshot de agendamentos:", error);
        });
    });

    // Ouvinte do campo de busca global
    document.getElementById('inputBusca')?.addEventListener('input', window.atualizarFiltros);
}

window.atualizarFiltros = () => {
    const termo = document.getElementById('inputBusca')?.value.toLowerCase() || "";

    dadosFiltrados = dadosMestres.filter(item => {
        const atendeColunas = Object.keys(filtrosAtivos).every(col => {
            if (!filtrosAtivos[col] || filtrosAtivos[col].length === 0) return true;
            
            // --- AJUSTE AQUI ---
            // Se for a coluna de situação e o valor estiver vazio, assume 'PENDENTE'
            let valItem = item[col];
            if (col === 'agendasituacao' && !valItem) {
                valItem = 'PENDENTE';
            }
            valItem = String(valItem || "");
            if (col === 'central') valItem = valItem.trim().toUpperCase();
            
            return filtrosAtivos[col].includes(valItem);
        });

        const compStr = item.composicao ? JSON.stringify(item.composicao).toLowerCase() : "";
        const atendeBusca = (JSON.stringify(item).toLowerCase() + compStr).includes(termo);

        return atendeColunas && atendeBusca;
    });

    atualizarIndicadoresVisuais();
    paginaAtual = 1;
    renderizarTudo();
};

let todosSelecionadosGlobal = false;

// Função para marcar/desmarcar todos os checkboxes da tabela e manter a seleção global
window.marcarTodos = (el) => {
    todosSelecionadosGlobal = el.checked;
    
    // Marca/desmarca os visíveis na tela atual
    const checkboxes = document.querySelectorAll('.row-check');
    checkboxes.forEach(chk => chk.checked = el.checked);
};

function renderizarTudo() {
    renderizarTabela();
    renderizarGrafico(dadosFiltrados);
}

function renderizarTabela() {
    const tbody = document.getElementById('corpoTabela');
    if(!tbody) return;

    const inicio = (paginaAtual - 1) * registrosPorPagina;
    const dadosPaginados = dadosFiltrados.slice(inicio, inicio + registrosPorPagina);
    
    tbody.innerHTML = "";
    dadosPaginados.forEach(item => {
        const isChecked = todosSelecionadosGlobal ? 'checked' : '';
        const dataBR = item.data ? item.data.split('-').reverse().join('/') : '---';
        const confStatus = situacoesCoresMaster[item.agendasituacao] || situacoesCoresMaster['DEFAULT'];
        const estiloTipo = getCoresPorTipoFull(item.tipoProduto || item.tipo);
        
        const infoSenha = item.veiculoAgrupado 
            ? `<div style="color:#0000FF; font-size:11px;">VEÍCULO: ${item.veiculoAgrupado}</div><div style="font-weight:bold">${item.senhaAgendamento}</div>`
            : `<div style="font-weight:bold">${item.senhaAgendamento || '---'}</div>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="row-check check-export" value="${item.id}" ${isChecked}></td>
            <td>${infoSenha}</td>
            <td>${dataBR}</td>
            <td>${item.central || '---'}</td>
            <td>${item.cargas || 1}</td>
            <td>
                <span style="background:#${confStatus.hex}; color:rgb(${confStatus.txt.join(',')}); padding:4px 8px; border-radius:4px; font-weight:bold; font-size:10px; display: block; text-align: center;">
                    ${item.agendasituacao || 'PENDENTE'}
                </span>
            </td>
            <td>${item.fornecedor || '---'}</td>
            <td>
                <span style="background:#${estiloTipo.hex}; color:rgb(${estiloTipo.txt.join(',')}); padding:4px 8px; border-radius:4px; font-weight:bold; font-size:10px; display: block; text-align: center;">
                    ${item.tipoProduto || '---'}
                </span>
            </td>
            <td>${item.box || '-'}</td>
            <td style="font-weight: bold;">${item.linhaSeparacao || '-'}</td>
            <td style="text-align: center;">
                <button class="btn-view-action" onclick="verDetalhes('${item.id}')" title="Ver Composição">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    atualizarControlesPaginacao();
}

function renderizarGrafico(dados) {
    const resumo = dados.reduce((acc, curr) => {
        const s = curr.agendasituacao || 'PENDENTE';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    const labels = Object.keys(resumo);
    const valores = Object.values(resumo);
    const cores = labels.map(l => `#${(situacoesCoresMaster[l] || situacoesCoresMaster['DEFAULT']).hex}`);

    const ctx = document.getElementById('chartSituacao').getContext('2d');
    if (myChart) myChart.destroy();
    
    myChart = new Chart(ctx, {
        type: 'pie',
        data: { 
            labels, 
            datasets: [{ 
                data: valores, 
                backgroundColor: cores,
                borderWidth: 2,
                borderColor: '#ffffff'
            }] 
        },
        plugins: [ChartDataLabels], // Ativa o plugin de labels
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 14 },
                    formatter: (value) => value, // Exibe o número bruto
                    textShadowColor: 'rgba(0, 0, 0, 0.5)',
                    textShadowBlur: 4
                }
            },
            onClick: (evt, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const situacaoClicada = labels[index];
                    abrirModalResumoGrafico(situacaoClicada);
                }
            }
        }
    });

    document.getElementById('resumoSituacoes').innerHTML = labels.map(l => {
        const c = situacoesCoresMaster[l] || situacoesCoresMaster['DEFAULT'];
        return `
            <div class="legenda-item" style="border-left-color: #${c.hex}; cursor:pointer" onclick="abrirModalResumoGrafico('${l}')">
                <div style="flex:1">${l} (${resumo[l]})</div>
            </div>
        `;
    }).join('');

    const totalCarros = new Set(dados.map(d => d.veiculoAgrupado || d.senhaAgendamento)).size;
    document.getElementById('infoTotal').innerHTML = `CARROS: ${totalCarros} | AGENDAS: ${dados.length}`;
}

window.abrirModalResumoGrafico = (situacao) => {
    const lista = dadosFiltrados.filter(d => (d.agendasituacao || 'PENDENTE') === situacao);
    const container = document.getElementById('detalhesItens'); // Reutilizando container de detalhes
    document.getElementById('tituloComp').innerText = `Lista: ${situacao}`;

    let html = `
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead style="background:#D32F2F; color:white;">
                <tr>
                    <th>SENHA</th>
                    <th>DATA</th>
                    <th>CARGAS</th>
                    <th>FORNECEDOR</th>
                    <th>TIPO</th>
                    <th>AÇÃO</th>
                </tr>
            </thead>
            <tbody>
    `;

    lista.forEach(item => {
        const dataBR = item.data ? item.data.split('-').reverse().join('/') : '---';
        html += `
            <tr style="border-bottom:1px solid #ddd; text-align:center;">
                <td style="padding:8px;">${item.senhaAgendamento}</td>
                <td>${dataBR}</td>
                <td>${item.cargas || 1}</td>
                <td style="text-align:left;">${item.fornecedor || '---'}</td>
                <td>${item.tipoProduto || '---'}</td>
                <td>
                    <button onclick="verDetalhes('${item.id}')" style="background:#0A497B; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
                        Ver Itens
                    </button>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    
    container.innerHTML = html;
    document.getElementById('modalComposicao').style.display = "flex";
};

window.abrirFiltro = (coluna, event) => {
    event.stopPropagation();
    colunaFiltroAtual = coluna;
    document.getElementById('nomeColunaFiltro').innerText = `Filtrar: ${coluna.toUpperCase()}`;
    const container = document.getElementById('opcoesFiltro');

    // Helper para tratar fallback da situação
    const obterValorColuna = (item, col) => {
        let val = item[col];
        if (col === 'agendasituacao' && !val) return 'PENDENTE';
        val = String(val || "");
        return col === 'central' ? val.trim().toUpperCase() : val;
    };

    const dadosParaOpcoes = dadosMestres.filter(item => {
        return Object.keys(filtrosAtivos).every(col => {
            if (col === coluna || filtrosAtivos[col].length === 0) return true;
            let valItem = obterValorColuna(item, col);
            return filtrosAtivos[col].includes(valItem);
        });
    });

    // Mapeia e limpa os valores (agora incluindo 'PENDENTE' para quem não tem status)
    const todosValores = [...new Set(dadosMestres.map(d => obterValorColuna(d, coluna)))].sort();

    const valoresDisponiveis = new Set(dadosParaOpcoes.map(d => obterValorColuna(d, coluna)));

    container.innerHTML = todosValores.map(val => {
        const isDisponivel = valoresDisponiveis.has(val);
        const isChecked = filtrosAtivos[coluna].includes(val);
        if(!val) return ''; // Só ignora se mesmo após o fallback continuar vazio
        
        return `
            <div style="padding:5px 0; display:flex; align-items:center; opacity: ${isDisponivel ? '1' : '0.5'}">
                <label style="cursor:pointer; display:flex; align-items:center; gap:10px; width:100%;">
                    <input type="checkbox" class="chk-filtro" value="${val}" ${isChecked ? 'checked' : ''}> 
                    <span>${coluna === 'data' ? val.split('-').reverse().join('/') : val}</span>
                    ${!isDisponivel ? '<small style="color:gray; margin-left:auto;">(Sem registros)</small>' : ''}
                </label>
            </div>
        `;
    }).join('');

    document.getElementById('modalFiltro').style.display = "flex";
};

window.marcarTodosFiltro = (status) => {
    document.querySelectorAll('.chk-filtro').forEach(chk => chk.checked = status);
};

window.aplicarFiltroColuna = () => {
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

function atualizarIndicadoresVisuais() {
    Object.keys(filtrosAtivos).forEach(col => {
        const btn = document.getElementById(`btn-filter-${col}`);
        if (btn) {
            if (filtrosAtivos[col] && filtrosAtivos[col].length > 0) {
                btn.innerText = 'APLICADO';
                btn.style.backgroundColor = '#fff176';
                btn.style.color = '#333';
                btn.style.border = '1px solid #fbc02d';
            } else {
                btn.innerText = 'FILTRAR';
                btn.style.backgroundColor = 'rgba(255,255,255,0.15)';
                btn.style.color = 'white';
                btn.style.border = '1px solid rgba(255,255,255,0.4)';
            }
        }
    });
}

// --- ORDENAÇÃO E PAGINAÇÃO ---
window.ordenarTabela = (coluna, el) => {
    if (ordemAtual.coluna === coluna) {
        ordemAtual.direcao = ordemAtual.direcao === 'asc' ? 'desc' : 'asc';
    } else {
        ordemAtual.coluna = coluna;
        ordemAtual.direcao = 'asc';
    }

    dadosFiltrados.sort((a, b) => {
        let valA = a[coluna] || '';
        let valB = b[coluna] || '';
        return ordemAtual.direcao === 'asc' 
            ? String(valA).localeCompare(String(valB), undefined, {numeric: true}) 
            : String(valB).localeCompare(String(valA), undefined, {numeric: true});
    });

    document.querySelectorAll('thead th i').forEach(i => i.className = 'fas fa-sort');
    const icon = el.querySelector('i');
    if(icon) icon.className = ordemAtual.direcao === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';

    renderizarTabela();
};

function atualizarControlesPaginacao() {
    const totalPaginas = Math.ceil(dadosFiltrados.length / registrosPorPagina) || 1;
    document.getElementById('infoPagina').innerText = `Página ${paginaAtual} de ${totalPaginas} (${dadosFiltrados.length} registros)`;
    
    const container = document.getElementById('botoesPagina');
    container.innerHTML = `
        <button class="btn-page" onclick="mudarPagina(-1)" ${paginaAtual === 1 ? 'disabled' : ''}>Anterior</button>
        <button class="btn-page" onclick="mudarPagina(1)" ${paginaAtual === totalPaginas ? 'disabled' : ''}>Próxima</button>
    `;
}

window.mudarPagina = (dir) => {
    paginaAtual += dir;
    renderizarTabela();
};

window.verDetalhes = (id) => {
    const item = dadosMestres.find(d => d.id === id);
    if(!item) return;

    document.getElementById('tituloComp').innerText = `Detalhes: ${item.senhaAgendamento}`;
    let totalQtd = 0;
    let tabela = `<table style="width:100%; border-collapse:collapse;">
        <thead style="background:#f4f4f4;"><tr><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>QTD</th></tr></thead><tbody>`;

    if(item.composicao) {
        item.composicao.forEach(prod => {
            const q = parseInt(prod.qtd || prod.quantidade || 0);
            totalQtd += q;
            tabela += `<tr><td>${prod.codigo}</td><td>${prod.descricao}</td><td style="font-weight:bold; color:red;">${q}</td></tr>`;
        });
    }
    tabela += `<tr style="background:#f9f9f9; font-weight:bold;"><td colspan="2" style="text-align:right;">TOTAL:</td><td style="color:red;">${totalQtd}</td></tr></tbody></table>`;

    document.getElementById('detalhesItens').innerHTML = tabela;
    document.getElementById('modalComposicao').style.display = "flex";
};

const obterIDsSelecionados = () => {
    if (todosSelecionadosGlobal) {
        return dadosFiltrados.map(d => d.id);
    }
    return Array.from(document.querySelectorAll('.check-export:checked')).map(c => c.value);
};

window.exportarPDF = async () => {
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF('l', 'mm', 'a4');

    const selecionados = obterIDsSelecionados();
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
    const selecionados = obterIDsSelecionados();
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

window.fecharModais = () => { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = "none"); };
window.logout = () => { localStorage.clear(); window.location.href = 'index.html'; };

init();
