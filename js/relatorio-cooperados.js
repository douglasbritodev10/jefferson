import { app } from './firebase-config.js';
import { 
    getFirestore, collection, query, where, getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const db = getFirestore(app);

// Recupera os dados iniciais salvos no navegador
let usuarioLogin = localStorage.getItem('username') || "SISTEMA";
let userRole = localStorage.getItem('role') || "COLABORADOR"; 

document.addEventListener('DOMContentLoaded', async () => {
    
    // ==========================================
    // TRAVA DE SEGURANÇA & PERSISTÊNCIA DE TELA
    // ==========================================
    if (usuarioLogin !== "SISTEMA") {
        try {
            const qUser = query(collection(db, "users"), where("username", "==", usuarioLogin.toUpperCase()));
            const querySnapshotUser = await getDocs(qUser);
            
            if (!querySnapshotUser.empty) {
                const dadosUsuario = querySnapshotUser.docs[0].data();
                userRole = dadosUsuario.nivelAcesso || "COLABORADOR";
                localStorage.setItem('role', userRole);
            }
        } catch (error) {
            console.error("Erro ao validar credenciais no Firestore:", error);
        }
    }

    // Validação final do Nível de Acesso
    if (userRole.toUpperCase() !== "ADM") {
        alert("Acesso restrito! Apenas administradores podem visualizar esta página.");
        window.location.href = "index.html";
        return;
    }

    // Exibe o nome do usuário na tela
    document.getElementById('user-display').textContent = usuarioLogin;
    
    // Inicializa campos de data vazios
    document.getElementById('dataInicio').value = "";
    document.getElementById('dataFim').value = "";

    carregarListaFiltroCooperados();
    
    // Fechar dropdown de checkboxes ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-checkbox')) {
            const drop = document.getElementById('dropdownCooperados');
            if(drop) drop.classList.remove('show');
        }
    });
});

let listaCooperadosBanco = [];
let dadosProcessadosReport = [];
let totaisIndividuaisReport = {};
let todasAgendasDoPeriodo = [];

// Carrega os nomes dos cooperados para compor o Dropdown
async function carregarListaFiltroCooperados() {
    try {
        const querySnapshot = await getDocs(collection(db, "cooperados"));
        listaCooperadosBanco = querySnapshot.docs
            .map(doc => doc.data().nome)
            .filter(nome => nome)
            .sort((a, b) => a.localeCompare(b));

        const container = document.getElementById('listaCheckCooperados');
        if (!container) return;
        
        container.innerHTML = listaCooperadosBanco.map(nome => `
            <div class="dropdown-item">
                <input type="checkbox" class="chk-cooperado-filtro" value="${nome}" onchange="window.atualizarLabelDropdown()">
                <span>${nome}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error("Erro ao carregar cooperados:", error);
    }
}

// Funções expostas no Objeto window
window.toggleDropdown = () => {
    document.getElementById('dropdownCooperados').classList.toggle('show');
};

window.marcarTodosCooperados = (status) => {
    document.querySelectorAll('.chk-cooperado-filtro').forEach(ck => ck.checked = status);
    window.atualizarLabelDropdown();
};

window.atualizarLabelDropdown = () => {
    const selecionados = Array.from(document.querySelectorAll('.chk-cooperado-filtro:checked'));
    const label = document.getElementById('dropdownLabel');
    const chkTodos = document.getElementById('chkTodos');
    
    if (!label) return;

    if (selecionados.length === 0) {
        label.textContent = "Todos os Cooperados";
    } else if (selecionados.length === listaCooperadosBanco.length) {
        label.textContent = "Todos Selecionados";
        if(chkTodos) chkTodos.checked = true;
    } else {
        label.textContent = `${selecionados.length} Cooperado(s) Selecionado(s)`;
        if(chkTodos) chkTodos.checked = false;
    }

    if (todasAgendasDoPeriodo.length > 0) {
        window.aplicarFiltroEmTempoReal();
    }
};

// Formatação Monetária Padrão Real Brasileiro
const formatarMoedaLocal = (valor) => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Gerador do Relatório adaptado para a sua estrutura real
window.gerarRelatorio = async () => {
    const dataInicioRaw = document.getElementById('dataInicio').value;
    const dataFimRaw = document.getElementById('dataFim').value;

    if (!dataInicioRaw || !dataFimRaw) {
        alert("Por favor, preencha o período inicial e final.");
        return;
    }

    const dataInicio = dataInicioRaw.split('T')[0];
    const dataFim = dataFimRaw.split('T')[0];

    try {
        const q = query(
            collection(db, "agendamentos"), 
            where("data", ">=", dataInicio), 
            where("data", "<=", dataFim),
            where("status", "==", "Agendada")
        );
        
        const querySnapshot = await getDocs(q);
        const agendasCruas = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const agendasValidas = agendasCruas.filter(a => {
            const valor = parseFloat(a.valorDescarga) || 0;
            return valor > 0;
        });

        // --- LÓGICA DE TRATAMENTO DE VEÍCULO AGRUPADO ---
        const gruposVeiculo = {};

        agendasValidas.forEach(a => {
            const chaveGrupo = (a.veiculoAgrupado && a.veiculoAgrupado.trim() !== "") 
                ? `GRP_${a.veiculoAgrupado.trim().toUpperCase()}` 
                : `IND_${a.id}`;

            let listaEquipe = [];
            if (a.equipe && typeof a.equipe === 'string') {
                listaEquipe = a.equipe.split(',').map(n => n.trim()).filter(n => n.length > 0);
            } else if (Array.isArray(a.equipe)) {
                listaEquipe = a.equipe;
            }

            const fornecedorAtual = (a.fornecedor || 'N/A').trim().toUpperCase();

            if (!gruposVeiculo[chaveGrupo]) {
                gruposVeiculo[chaveGrupo] = {
                    data: a.data,
                    fornecedoresArray: [fornecedorAtual],
                    valorDescarga: 0,
                    cooperadosArray: listaEquipe,
                    senhas: [a.senhaAgendamento || "N/A"]
                };
            } else {
                if (a.senhaAgendamento && !gruposVeiculo[chaveGrupo].senhas.includes(a.senhaAgendamento)) {
                    gruposVeiculo[chaveGrupo].senhas.push(a.senhaAgendamento);
                }
                // Adiciona o fornecedor se ele não constar na carga fracionada
                if (!gruposVeiculo[chaveGrupo].fornecedoresArray.includes(fornecedorAtual)) {
                    gruposVeiculo[chaveGrupo].fornecedoresArray.push(fornecedorAtual);
                }
                // Mescla equipe garantindo nomes únicos
                listaEquipe.forEach(nome => {
                    if (!gruposVeiculo[chaveGrupo].cooperadosArray.includes(nome)) {
                        gruposVeiculo[chaveGrupo].cooperadosArray.push(nome);
                    }
                });
            }
            gruposVeiculo[chaveGrupo].valorDescarga += parseFloat(a.valorDescarga) || 0;
        });

        todasAgendasDoPeriodo = Object.values(gruposVeiculo);
        window.aplicarFiltroEmTempoReal();

    } catch (e) {
        console.error("Erro ao gerar relatório:", e);
        alert("Erro ao buscar dados do banco de dados.");
    }
};

window.aplicarFiltroEmTempoReal = () => {
    const cooperadosSelecionados = Array.from(document.querySelectorAll('.chk-cooperado-filtro:checked')).map(cb => cb.value);

    dadosProcessadosReport = todasAgendasDoPeriodo
        .filter(a => {
            const temCooperados = a.cooperadosArray && a.cooperadosArray.length > 0;
            if (cooperadosSelecionados.length > 0) {
                // Exibe apenas as agendas nas quais os cooperados filtrados trabalharam
                return temCooperados && a.cooperadosArray.some(nome => cooperadosSelecionados.includes(nome));
            }
            return temCooperados;
        })
        .sort((a, b) => (a.data || "").localeCompare(b.data || ""));

    if (dadosProcessadosReport.length === 0) {
        window.limparResultados();
        return;
    }

    window.renderizarTabelasTela(cooperadosSelecionados);
};

window.limparResultados = () => {
    document.getElementById('botoesExportacao').style.display = 'none';
    document.getElementById('secaoAgrupado').style.display = 'none';
    document.getElementById('secaoIndividual').style.display = 'none';
};

window.renderizarTabelasTela = (cooperadosFiltrados) => {
    const corpoAgrupado = document.getElementById('corpoAgrupado');
    const corpoIndividual = document.getElementById('corpoIndividual');
    
    corpoAgrupado.innerHTML = "";
    corpoIndividual.innerHTML = "";
    
    totaisIndividuaisReport = {};
    let dataReferenciaAnterior = "";
    let classeEstiloDia = "dia-par";

    // Acumuladores de totais gerais da Tabela 1 na tela
    let t1TotalGeralCarga = 0;
    let t1TotalGeralLiquido = 0;
    let t1TotalGeralPagarComInss = 0;

    dadosProcessadosReport.forEach(agenda => {
        const dataFormatada = window.formatarDataBR(agenda.data);
        
        if (agenda.data !== dataReferenciaAnterior) {
            classeEstiloDia = (classeEstiloDia === "dia-par") ? "dia-impar" : "dia-par";
            dataReferenciaAnterior = agenda.data;
        }

        const valorTotal = agenda.valorDescarga;
        const valorLíquidoSetenta = valorTotal * 0.70; 
        const listaEquipe = agenda.cooperadosArray || [];
        const qtdParticipantes = listaEquipe.length;

        // Cálculos unitários solicitados
        const quotaParteBruta = qtdParticipantes > 0 ? (valorLíquidoSetenta / qtdParticipantes) : 0;
        const inssCalculado = quotaParteBruta * 0.20;
        const valorComInss = quotaParteBruta + inssCalculado;
        const totalDescargaComInssIncluido = valorComInss * qtdParticipantes;

        // Soma acumulativa dos totais da tabela superior
        t1TotalGeralCarga += valorTotal;
        t1TotalGeralLiquido += valorLíquidoSetenta;
        t1TotalGeralPagarComInss += totalDescargaComInssIncluido;

        // Une os fornecedores por vírgula na mesma linha (Sem quebra de linha)
        const stringFornecedores = agenda.fornecedoresArray.join(', ');

        const trAgrupado = document.createElement('tr');
        trAgrupado.className = classeEstiloDia;
        trAgrupado.innerHTML = `
            <td data-label="Data">${dataFormatada}</td>
            <td data-label="Fornecedor" class="text-nowrap">${stringFornecedores}</td>
            <td data-label="Qtd. Colaboradores" class="fw-bold text-center">${qtdParticipantes}</td>
            <td data-label="Nomes dos Cooperados">${listaEquipe.join(', ') || 'Nenhum'}</td>
            <td data-label="Valor Total (R$)" class="text-end text-nowrap">${formatarMoedaLocal(valorTotal)}</td>
            <td data-label="Líquido (70%)" class="text-end text-nowrap fw-bold">${formatarMoedaLocal(valorLíquidoSetenta)}</td>
            <td data-label="Valor P/ Cada" class="text-end text-nowrap">${formatarMoedaLocal(quotaParteBruta)}</td>
            <td data-label="Valor 20% INSS" class="text-end text-nowrap text-danger">${formatarMoedaLocal(inssCalculado)}</td>
            <td data-label="Valor C/ INSS" class="text-end text-nowrap text-success">${formatarMoedaLocal(valorComInss)}</td>
            <td data-label="Valor á Pagar" class="text-end text-nowrap fw-bold bg-light">${formatarMoedaLocal(totalDescargaComInssIncluido)}</td>
        `;
        corpoAgrupado.appendChild(trAgrupado);

        // Alimenta o cálculo individual da Tabela 2
        listaEquipe.forEach(nome => {
            if (!totaisIndividuaisReport[nome]) {
                totaisIndividuaisReport[nome] = { bruto: 0, inss: 0, liquido: 0 };
            }
            totaisIndividuaisReport[nome].bruto += quotaParteBruta;
            totaisIndividuaisReport[nome].inss += inssCalculado;
            totaisIndividuaisReport[nome].liquido += valorComInss;
        });
    });

    // Renderiza a linha de Totais da Tabela 1 na tela (tfoot)
    let tfootAgrupado = document.getElementById('footAgrupado');
    if(!tfootAgrupado) {
        tfootAgrupado = document.createElement('tfoot');
        tfootAgrupado.id = 'footAgrupado';
        corpoAgrupado.parentNode.appendChild(tfootAgrupado);
    }
    tfootAgrupado.innerHTML = `
        <tr class="table-dark fw-bold">
            <td colspan="4" class="text-start">TOTAIS GERAIS ACUMULADOS:</td>
            <td class="text-end text-nowrap">${formatarMoedaLocal(t1TotalGeralCarga)}</td>
            <td class="text-end text-nowrap" style="color: #000000;">${formatarMoedaLocal(t1TotalGeralLiquido)}</td>
            <td colspan="3"></td>
            <td class="text-end text-nowrap" style="color: #4caf50;">${formatarMoedaLocal(t1TotalGeralPagarComInss)}</td>
        </tr>
    `;

    // Acumuladores de totais da Tabela 2
    let t2TotalGeralBruto = 0;
    let t2TotalGeralInss = 0;
    let t2TotalGeralLiquido = 0;

    // Filtra para exibir apenas os cooperados selecionados na Tabela 2 se houver filtro ativo
    Object.keys(totaisIndividuaisReport).sort().forEach(nome => {
        if (cooperadosFiltrados.length > 0 && !cooperadosFiltrados.includes(nome)) {
            return; // Ignora se houver filtro ativo e ele não for um dos selecionados
        }

        const item = totaisIndividuaisReport[nome];
        t2TotalGeralBruto += item.bruto;
        t2TotalGeralInss += item.inss;
        t2TotalGeralLiquido += item.liquido;

        const trIndiv = document.createElement('tr');
        trIndiv.innerHTML = `
            <td data-label="Nome do Cooperado" class="fw-bold"><i class="fas fa-user-circle"></i> ${nome}</td>
            <td data-label="Quota Parte Rateio (R$)" class="text-end text-nowrap">${formatarMoedaLocal(item.bruto)}</td>
            <td data-label="INSS Próprio +20% (R$)" class="text-end text-nowrap" style="color: #c62828;">${formatarMoedaLocal(item.inss)}</td>
            <td data-label="Líquido a Pagar (R$)" class="text-end text-nowrap fw-bold" style="color: #2e7d32;">${formatarMoedaLocal(item.liquido)}</td>
        `;
        corpoIndividual.appendChild(trIndiv);
    });

    // Renderiza a linha de Totais da Tabela 2 na tela (tfoot)
    let tfootIndividual = document.getElementById('footIndividual');
    if(!tfootIndividual) {
        tfootIndividual = document.createElement('tfoot');
        tfootIndividual.id = 'footIndividual';
        corpoIndividual.parentNode.appendChild(tfootIndividual);
    }
    tfootIndividual.innerHTML = `
        <tr class="table-success fw-bold text-dark">
            <td class="text-start">TOTAL GERAL DE REPASSES:</td>
            <td class="text-end text-nowrap">${formatarMoedaLocal(t2TotalGeralBruto)}</td>
            <td class="text-end text-nowrap" style="color: #b71c1c;">${formatarMoedaLocal(t2TotalGeralInss)}</td>
            <td class="text-end text-nowrap" style="color: #1b5e20;">${formatarMoedaLocal(t2TotalGeralLiquido)}</td>
        </tr>
    `;

    document.getElementById('botoesExportacao').style.display = 'flex';
    document.getElementById('secaoAgrupado').style.display = 'block';
    document.getElementById('secaoIndividual').style.display = 'block';
};

window.formatarDataBR = (dataString) => {
    if(!dataString) return "";
    const partes = dataString.split('-');
    if(partes.length !== 3) return dataString;
    return `${partes[2]}/${partes[1]}/${partes[0]}`; 
};

// ==================== ENGINE DE EXPORTAÇÃO EXCEL ====================
window.exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Fechamento de Cooperados');

    sheet.mergeCells('A1:J1');
    const headerCell = sheet.getCell('A1');
    headerCell.value = "MÓVEIS SIMONETTI - RELATÓRIO DE REPASSE DE COOPERADOS";
    headerCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D32F2F' } };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 40;

    sheet.mergeCells('A2:J2');
    sheet.getCell('A2').value = `Período Analisado: ${window.formatarDataBR(document.getElementById('dataInicio').value)} até ${window.formatarDataBR(document.getElementById('dataFim').value)}`;
    sheet.getCell('A2').font = { italic: true, size: 11 };

    sheet.addRow([]); 
    const rowTitle1 = sheet.addRow(["1. Resumo de Movimentações por Agenda / Grupo"]);
    rowTitle1.getCell(1).font = { bold: true, size: 12 };
    
    const headersT1 = [
        "Data", "Fornecedor(es)", "Qtd Colaboradores", "Nomes dos Cooperados Activos", 
        "Valor Total (R$)", "Líquido (70%)", "VALOR P/ CADA", "Valor 20% INSS", "VALOR C/ INSS", "Valor á Pagar da descarga com o INSS INCLOSO"
    ];
    const headerRowT1 = sheet.addRow(headersT1);
    headerRowT1.eachCell(c => {
        c.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '424242' } };
        c.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    });

    let totalT1Carga = 0;
    let totalT1Liquido = 0;
    let totalT1PagarInss = 0;

    // Variáveis para controlar a alternância de cores por dia
    let dataReferenciaAnterior = "";
    let usarCorAlternada = false;

    dadosProcessadosReport.forEach(agenda => {
        const equipe = agenda.cooperadosArray || [];
        const valorCarga = agenda.valorDescarga;
        const valorLiquido = valorCarga * 0.7;
        const qtd = equipe.length;

        const quotaParte = qtd > 0 ? (valorLiquido / qtd) : 0;
        const inss = quotaParte * 0.20;
        const valorComInss = quotaParte + inss;
        const totalDescargaComInss = valorComInss * qtd;

        totalT1Carga += valorCarga;
        totalT1Liquido += valorLiquido;
        totalT1PagarInss += totalDescargaComInss;

        // Lógica de saltação de cor idêntica ao PDF
        if (agenda.data !== dataReferenciaAnterior) {
            usarCorAlternada = !usarCorAlternada;
            dataReferenciaAnterior = agenda.data;
        }

        const r = sheet.addRow([
            window.formatarDataBR(agenda.data),
            agenda.fornecedoresArray.join(', '),
            qtd,
            equipe.join(', '),
            valorCarga,
            valorLiquido,
            quotaParte,
            inss,
            valorComInss,
            totalDescargaComInss
        ]);

        // Define a cor de fundo baseado no dia do agendamento
        const corFundoLinha = usarCorAlternada ? 'F0F4FA' : 'FFFFFF';

        r.eachCell((cell, colNumber) => {
            // Aplica o fundo zebrado por dia
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: corFundoLinha }
            };
            
            // Adiciona bordas finas para melhor legibilidade
            cell.border = {
                top: { style: 'thin', color: { argb: 'E0E0E0' } },
                bottom: { style: 'thin', color: { argb: 'E0E0E0' } },
                left: { style: 'thin', color: { argb: 'E0E0E0' } },
                right: { style: 'thin', color: { argb: 'E0E0E0' } }
            };

            // Formata as colunas financeiras (da coluna 5 até a 10)
            if (colNumber >= 5 && colNumber <= 10) {
                cell.numberFormat = '"R$"#,##0.00';
                cell.alignment = { horizontal: 'right' };
            }
        });
    });

    // Linha de totais acumulados da Tabela 1
    const linhaTotalT1 = sheet.addRow(["TOTAL:", "", "", "", totalT1Carga, totalT1Liquido, "", "", "", totalT1PagarInss]);
    linhaTotalT1.getCell(1).font = { bold: true };
    linhaTotalT1.getCell(5).font = { bold: true };
    linhaTotalT1.getCell(5).numberFormat = '"R$"#,##0.00';
    linhaTotalT1.getCell(6).font = { bold: true, color: { argb: 'B71C1C' } };
    linhaTotalT1.getCell(6).numberFormat = '"R$"#,##0.00';
    linhaTotalT1.getCell(10).font = { bold: true, color: { argb: '1B5E20' } };
    linhaTotalT1.getCell(10).numberFormat = '"R$"#,##0.00';

    sheet.addRow([]);
    sheet.addRow([]);

    const rowTitle2 = sheet.addRow(["2. Demonstrativo Líquido de Repasse Individual"]);
    rowTitle2.getCell(1).font = { bold: true, size: 12 };

    const headersT2 = ["Nome do Cooperado", "Quota Parte Rateio (R$)", "INSS Próprio +20% (R$)", "Líquido a Pagar (R$)"];
    const headerRowT2 = sheet.addRow(headersT2);
    headerRowT2.eachCell(c => {
        c.font = { bold: true, color: { argb: 'FFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1B5E20' } };
        c.alignment = { horizontal: 'center' };
    });

    let totalGeralBruto = 0;
    let totalGeralInss = 0;
    let totalGeralRepasse = 0;

    const cooperadosSelecionados = Array.from(document.querySelectorAll('.chk-cooperado-filtro:checked')).map(cb => cb.value);

    Object.keys(totaisIndividuaisReport).sort().forEach(nome => {
        if (cooperadosSelecionados.length > 0 && !cooperadosSelecionados.includes(nome)) return;

        const item = totaisIndividuaisReport[nome];
        const r = sheet.addRow([nome, item.bruto, item.inss, item.liquido]);
        
        r.getCell(2).numberFormat = '"R$"#,##0.00';
        r.getCell(3).numberFormat = '"R$"#,##0.00';
        r.getCell(4).numberFormat = '"R$"#,##0.00';
        
        totalGeralBruto += item.bruto;
        totalGeralInss += item.inss;
        totalGeralRepasse += item.liquido;
    });

    sheet.addRow([]);
    const linhaTotal = sheet.addRow(["TOTAL GERAL DE REPASSES:", totalGeralBruto, totalGeralInss, totalGeralRepasse]);
    linhaTotal.getCell(1).font = { bold: true };
    linhaTotal.getCell(2).font = { bold: true };
    linhaTotal.getCell(2).numberFormat = '"R$"#,##0.00';
    linhaTotal.getCell(3).font = { bold: true };
    linhaTotal.getCell(3).numberFormat = '"R$"#,##0.00';
    linhaTotal.getCell(4).font = { bold: true, color: { argb: '1B5E20' } };
    linhaTotal.getCell(4).numberFormat = '"R$"#,##0.00';

    // Redimensionamento proporcional das colunas com trava no nome (Coluna D)
    sheet.columns.forEach((column, index) => {
        let maxLen = 0;
        column.eachCell({ includeEmpty: true }, cell => {
            const valLen = cell.value ? cell.value.toString().length : 0;
            if (valLen > maxLen) maxLen = valLen;
        });
        
        let calculatedWidth = maxLen < 12 ? 12 : maxLen + 4;
        
        // Coluna D é o índice 4 (Nomes dos Cooperados Activos) -> Limitar largura máxima
        if (index === 4) {
            column.width = calculatedWidth > 45 ? 45 : calculatedWidth; 
        } else {
            column.width = calculatedWidth;
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Fechamento_Cooperados_${document.getElementById('dataInicio').value}_a_${document.getElementById('dataFim').value}.xlsx`;
    link.click();
};

// ==================== ENGINE DE EXPORTAÇÃO PDF ====================
window.exportarPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'pt', 'a4'); 

    const formatarMoedaBR = (valor) => {
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    doc.setFillColor(211, 47, 47); 
    doc.rect(0, 0, 842, 60, 'F');
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("MÓVEIS SIMONETTI - LOGÍSTICA", 40, 36);
    
    doc.setFontSize(10);
    doc.setFont("Helvetica", "normal");
    doc.text(`Relatório Gerencial de Pagamento de Cooperados | Emitido por: ${usuarioLogin}`, 40, 50);

    doc.setTextColor(51, 51, 51);
    doc.setFontSize(11);
    doc.setFont("Helvetica", "bold");
    doc.text(`Período de Apuração: ${window.formatarDataBR(document.getElementById('dataInicio').value)} até ${window.formatarDataBR(document.getElementById('dataFim').value)}`, 40, 90);

    doc.text("1. Relatório de pagamento de Descarga", 40, 115);
    
    const columnsT1 = [
        "Data", "Fornecedor(es)", "Qtd", "Cooperados", "Líq 70%", "P/ Cada", "20% INSS", "C/ INSS", "Total á Pagar"
    ];

    let sumT1Liquido = 0;
    let sumT1TotalPagar = 0;

    const rowsT1 = dadosProcessadosReport.map(agenda => {
        const equipe = agenda.cooperadosArray || [];
        const valorLiquido = agenda.valorDescarga * 0.70;
        const qtd = equipe.length;
        
        const quotaParte = qtd > 0 ? (valorLiquido / qtd) : 0;
        const inss = quotaParte * 0.20;
        const cInss = quotaParte + inss;
        const totalPagar = cInss * qtd;

        sumT1Liquido += valorLiquido;
        sumT1TotalPagar += totalPagar;

        return [
            window.formatarDataBR(agenda.data),
            agenda.fornecedoresArray.join(', '),
            qtd,
            equipe.join(', '),
            formatarMoedaBR(valorLiquido),
            formatarMoedaBR(quotaParte),
            formatarMoedaBR(inss),
            formatarMoedaBR(cInss),
            formatarMoedaBR(totalPagar)
        ];
    });

    const footT1 = [["TOTAL", "", "", "", formatarMoedaBR(sumT1Liquido), "", "", "", formatarMoedaBR(sumT1TotalPagar)]];

    doc.autoTable({
        startY: 125,
        head: [columnsT1],
        body: rowsT1,
        foot: footT1,
        theme: 'grid',
        showFoot: 'lastPage',
        rowPageBreak: 'avoid', // EVITA QUEBRA DE LINHA AO MEIO: Se a linha com muitos cooperados não couber, ela desce inteira para a próxima página
        headStyles: { fillColor: [66, 66, 66], fontStyle: 'bold', fontSize: 8, halign: 'center' },
        footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
        styles: { 
            fontSize: 8,
            lineWidth: 0.5,
            borderColor: [210, 210, 210]
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 55 },
            1: { halign: 'left', cellWidth: 110 }, 
            2: { halign: 'center', cellWidth: 35 },
            3: { halign: 'left', cellWidth: 150 },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right' },
            7: { halign: 'right' },
            8: { halign: 'right' }
        },
        didParseCell: function(data) {
            if (data.section === 'body') {
                const dataRowIndex = data.row.index;
                let refData = dadosProcessadosReport[dataRowIndex].data;
                let todasDatas = dadosProcessadosReport.map(d => d.data);
                let listaDatasUnicas = [...new Set(todasDatas)];
                let indiceData = listaDatasUnicas.indexOf(refData);
                data.cell.styles.fillColor = (indiceData % 2 === 0) ? [255, 255, 255] : [240, 244, 250];
            }
            if (data.section === 'foot') {
                if (data.column.index >= 4 && data.column.index <= 8) {
                    data.cell.styles.halign = 'right';
                }
            }
        }
    });

    // SEPARAÇÃO E ISOLAMENTO: Segunda tabela sempre isolada de forma limpa
    doc.addPage(); 
    let currentY = 60;

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(51, 51, 51);
    doc.text("2. Demonstrativo Líquido de Repasse Individual", 40, currentY);

    const columnsT2 = ["Nome do Cooperado", "Quota Parte Rateio (R$)", "INSS Próprio +20% (R$)", "Líquido a Pagar (R$)"];
    
    let sumT2Bruto = 0;
    let sumT2Inss = 0;
    let sumT2Liquido = 0;

    const cooperadosSelecionados = Array.from(document.querySelectorAll('.chk-cooperado-filtro:checked')).map(cb => cb.value);
    const rowsT2 = [];

    Object.keys(totaisIndividuaisReport).sort().forEach(nome => {
        if (cooperadosSelecionados.length > 0 && !cooperadosSelecionados.includes(nome)) return;

        const item = totaisIndividuaisReport[nome];
        sumT2Bruto += item.bruto;
        sumT2Inss += item.inss;
        sumT2Liquido += item.liquido;

        rowsT2.push([
            nome,
            formatarMoedaBR(item.bruto),
            formatarMoedaBR(item.inss),
            formatarMoedaBR(item.liquido)
        ]);
    });

    const footT2 = [["TOTAL GERAL DE REPASSES", formatarMoedaBR(sumT2Bruto), formatarMoedaBR(sumT2Inss), formatarMoedaBR(sumT2Liquido)]];

    doc.autoTable({
        startY: currentY + 15,
        head: [columnsT2],
        body: rowsT2,
        foot: footT2,
        theme: 'grid',
        showFoot: 'lastPage',
        rowPageBreak: 'avoid', // Aplica a mesma segurança na tabela de repasse individual
        headStyles: { fillColor: [46, 125, 50], fontStyle: 'bold', halign: 'center' }, 
        footStyles: { fillColor: [27, 94, 32], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { 
            fontSize: 9,
            lineWidth: 0.5,
            borderColor: [180, 200, 180]
        },
        columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' }
        },
        didParseCell: function(data) {
            if (data.section === 'foot') {
                if (data.column.index >= 1) {
                    data.cell.styles.halign = 'right';
                }
            }
        }
    });

    let finalY = doc.lastAutoTable.finalY + 45;
    if (finalY > 530) { 
        doc.addPage(); 
        finalY = 60; 
    }
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.line(40, finalY, 240, finalY);
    doc.text("Recebimento Simonetti (ADM)", 40, finalY + 15);

    doc.save(`Relatorio_Gerencial_Cooperados_${document.getElementById('dataInicio').value}.pdf`);
};
