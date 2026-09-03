import { app } from './firebase-config.js';
import { 
    getFirestore, collection, getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Inicializa a instância do banco a partir do app importado
const db = getFirestore(app);

// Instâncias Globais dos Gráficos
let chartEvolucaoInstance = null;
let chartFornecedoresInstance = null;
let chartCentraisInstance = null;

// Armazenamento em memória
let todosAgendamentos = [];

const limparEspacos = (valor) => String(valor || "").trim().replace(/\s+/g, " ");

document.addEventListener('DOMContentLoaded', async () => {
    configurarDatasPadrao();
    await carregarDadosFirebase();
    popularOpcoesFiltro();
    executarAnaliseDashboard();
});

function configurarDatasPadrao() {
    const hoje = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(hoje.getDate() - 30);

    document.getElementById('dashDataInicio').value = trintaDiasAtras.toISOString().split('T')[0];
    document.getElementById('dashDataFim').value = hoje.toISOString().split('T')[0];
}

async function carregarDadosFirebase() {
    try {
        const snap = await getDocs(collection(db, "agendamentos"));
        todosAgendamentos = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.status !== "Rascunho" && data.data) {
                todosAgendamentos.push(data);
            }
        });
    } catch (err) {
        console.error("Erro ao carregar agendamentos:", err);
    }
}

function popularOpcoesFiltro() {
    const centrais = new Set();
    const fornecedores = new Set();
    const tipos = new Set();

    todosAgendamentos.forEach(ag => {
        if (ag.central) centrais.add(limparEspacos(ag.central).toUpperCase());
        if (ag.fornecedor) fornecedores.add(limparEspacos(ag.fornecedor).toUpperCase());
        if (ag.tipoProduto) tipos.add(limparEspacos(ag.tipoProduto).toUpperCase());
    });

    preencherSelect('dashCentral', Array.from(centrais).sort());
    preencherSelect('dashFornecedor', Array.from(fornecedores).sort());
    preencherSelect('dashTipoProduto', Array.from(tipos).sort());
}

function preencherSelect(elementId, opcoes) {
    const select = document.getElementById(elementId);
    select.innerHTML = '';
    opcoes.forEach(op => {
        select.innerHTML += `<option value="${op}">${op}</option>`;
    });
}

function getValoresSelecionados(elementId) {
    const select = document.getElementById(elementId);
    return Array.from(select.selectedOptions).map(option => option.value);
}

window.executarAnaliseDashboard = function() {
    const dIni = document.getElementById('dashDataInicio').value;
    const dFim = document.getElementById('dashDataFim').value;

    const centraisSel = getValoresSelecionados('dashCentral');
    const fornecedoresSel = getValoresSelecionados('dashFornecedor');
    const tiposSel = getValoresSelecionados('dashTipoProduto');
    const agrupamento = document.getElementById('dashAgrupamento').value;

    // Período Atual
    const filtrados = todosAgendamentos.filter(ag => {
        const dataOk = ag.data >= dIni && ag.data <= dFim;
        const centralOk = centraisSel.length === 0 || centraisSel.includes(limparEspacos(ag.central).toUpperCase());
        const fornOk = fornecedoresSel.length === 0 || fornecedoresSel.includes(limparEspacos(ag.fornecedor).toUpperCase());
        const tipoOk = tiposSel.length === 0 || tiposSel.includes(limparEspacos(ag.tipoProduto).toUpperCase());

        return dataOk && centralOk && fornOk && tipoOk;
    });

    // Período Anterior para Variação %
    const diffDias = (new Date(dFim) - new Date(dIni)) / (1000 * 60 * 60 * 24) + 1;
    const dataIniAnt = new Date(dIni);
    dataIniAnt.setDate(dataIniAnt.getDate() - diffDias);
    const dataFimAnt = new Date(dIni);
    dataFimAnt.setDate(dataFimAnt.getDate() - 1);

    const strIniAnt = dataIniAnt.toISOString().split('T')[0];
    const strFimAnt = dataFimAnt.toISOString().split('T')[0];

    const filtradosAnterior = todosAgendamentos.filter(ag => {
        const dataOk = ag.data >= strIniAnt && ag.data <= strFimAnt;
        const centralOk = centraisSel.length === 0 || centraisSel.includes(limparEspacos(ag.central).toUpperCase());
        const fornOk = fornecedoresSel.length === 0 || fornecedoresSel.includes(limparEspacos(ag.fornecedor).toUpperCase());
        const tipoOk = tiposSel.length === 0 || tiposSel.includes(limparEspacos(ag.tipoProduto).toUpperCase());

        return dataOk && centralOk && fornOk && tipoOk;
    });

    // KPIS
    const totalAtual = filtrados.length;
    const totalAnterior = filtradosAnterior.length;

    let varPct = 0;
    if (totalAnterior > 0) {
        varPct = (((totalAtual - totalAnterior) / totalAnterior) * 100).toFixed(1);
    } else if (totalAtual > 0) {
        varPct = 100;
    }

    document.getElementById('kpiTotalAgendamentos').innerText = totalAtual;
    const kpiVarElem = document.getElementById('kpiVarTotal');
    if (varPct >= 0) {
        kpiVarElem.className = "kpi-sub kpi-up";
        kpiVarElem.innerHTML = `<i class="fas fa-arrow-up"></i> +${varPct}% vs período anterior`;
    } else {
        kpiVarElem.className = "kpi-sub kpi-down";
        kpiVarElem.innerHTML = `<i class="fas fa-arrow-down"></i> ${varPct}% vs período anterior`;
    }

    const mediaDiaria = (totalAtual / Math.max(diffDias, 1)).toFixed(1);
    document.getElementById('kpiMediaDiaria').innerText = mediaDiaria;

    // Top Fornecedor
    const mapFornecedores = {};
    filtrados.forEach(ag => {
        const f = limparEspacos(ag.fornecedor).toUpperCase() || "NÃO INFORMADO";
        mapFornecedores[f] = (mapFornecedores[f] || 0) + 1;
    });

    const fornOrdenados = Object.entries(mapFornecedores).sort((a, b) => b[1] - a[1]);

    if (fornOrdenados.length > 0) {
        const topForn = fornOrdenados[0];
        const pctTop = ((topForn[1] / totalAtual) * 100).toFixed(1);
        document.getElementById('kpiTopFornecedor').innerText = topForn[0];
        document.getElementById('kpiTopFornecedorPct').innerText = `${pctTop}% do total (${topForn[1]} cargas)`;
    } else {
        document.getElementById('kpiTopFornecedor').innerText = "-";
        document.getElementById('kpiTopFornecedorPct').innerText = "0% do total";
    }

    // Atualiza Visualizações
    renderizarGraficoEvolucao(filtrados, agrupamento);
    renderizarGraficoFornecedores(fornOrdenados, totalAtual);
    renderizarGraficoCentrais(filtrados);
    renderizarTabelaFornecedores(fornOrdenados, totalAtual);
};

function renderizarGraficoEvolucao(dados, agrupamento) {
    const mapaTempo = {};

    dados.forEach(ag => {
        let chave = ag.data;
        const d = new Date(ag.data + 'T00:00:00');

        if (agrupamento === 'mes') {
            chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else if (agrupamento === 'semana') {
            const primeiroDiaAno = new Date(d.getFullYear(), 0, 1);
            const numSemana = Math.ceil((((d - primeiroDiaAno) / 86400000) + primeiroDiaAno.getDay() + 1) / 7);
            chave = `Semana ${numSemana} - ${d.getFullYear()}`;
        } else if (agrupamento === 'ano') {
            chave = `${d.getFullYear()}`;
        }

        mapaTempo[chave] = (mapaTempo[chave] || 0) + 1;
    });

    const labels = Object.keys(mapaTempo).sort();
    const valores = labels.map(l => mapaTempo[l]);

    const ctx = document.getElementById('chartEvolucao').getContext('2d');
    if (chartEvolucaoInstance) chartEvolucaoInstance.destroy();

    chartEvolucaoInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cargas Agendadas',
                data: valores,
                borderColor: '#D32F2F',
                backgroundColor: 'rgba(211, 47, 47, 0.1)',
                fill: true,
                tension: 0.3,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

function renderizarGraficoFornecedores(fornOrdenados, total) {
    const top5 = fornOrdenados.slice(0, 5);
    const outrosQtd = fornOrdenados.slice(5).reduce((acc, curr) => acc + curr[1], 0);

    const labels = top5.map(f => f[0]);
    const valores = top5.map(f => f[1]);

    if (outrosQtd > 0) {
        labels.push('OUTROS');
        valores.push(outrosQtd);
    }

    const ctx = document.getElementById('chartFornecedores').getContext('2d');
    if (chartFornecedoresInstance) chartFornecedoresInstance.destroy();

    chartFornecedoresInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: ['#D32F2F', '#1976D2', '#388E3C', '#FBC02D', '#7B1FA2', '#616161']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });
}

function renderizarGraficoCentrais(dados) {
    const mapaCentrais = {};
    dados.forEach(ag => {
        const c = limparEspacos(ag.central).toUpperCase() || "NÃO INFORMADA";
        mapaCentrais[c] = (mapaCentrais[c] || 0) + 1;
    });

    const labels = Object.keys(mapaCentrais);
    const valores = Object.values(mapaCentrais);

    const ctx = document.getElementById('chartCentrais').getContext('2d');
    if (chartCentraisInstance) chartCentraisInstance.destroy();

    chartCentraisInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cargas Recebidas',
                data: valores,
                backgroundColor: '#212121'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

function renderizarTabelaFornecedores(fornOrdenados, total) {
    const tbody = document.getElementById('corpoTabelaDashboard');
    tbody.innerHTML = '';

    if (fornOrdenados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#999;">Nenhum dado encontrado para os filtros selecionados.</td></tr>`;
        return;
    }

    fornOrdenados.forEach(([fornecedor, qtd]) => {
        const pct = total > 0 ? ((qtd / total) * 100).toFixed(1) : 0;
        tbody.innerHTML += `
            <tr>
                <td style="font-weight: bold;">${fornecedor}</td>
                <td>${qtd}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>${pct}%</span>
                        <div style="background:#eee; width:100px; height:8px; border-radius:4px; overflow:hidden;">
                            <div style="background:var(--primary); width:${pct}%; height:100%;"></div>
                        </div>
                    </div>
                </td>
                <td><span style="color:#2e7d32; font-weight:bold;"><i class="fas fa-check-circle"></i> Ativo</span></td>
            </tr>
        `;
    });
}
