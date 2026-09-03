import { app } from './firebase-config.js';
import {
    getFirestore, doc, setDoc, collection, addDoc, onSnapshot, query, orderBy,
    updateDoc, getDocs, limit, serverTimestamp, deleteDoc, getDoc, where
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const db = getFirestore(app);
const usuarioNome = localStorage.getItem('usuarioNome') || "DESCONHECIDO";
let itensCargaTmp = [];
let senhaAbertaNoModal = "";
let filtroColunaAtivo = { campo: null, valores: [] };

// Mudança aqui: Pegamos o 'username' que o seu auth.js já salva!
const usuarioUsername = localStorage.getItem('username') || "DESCONHECIDO";
const usuarioNomeCompleto = localStorage.getItem('usuarioNome') || "DESCONHECIDO";

async function verificarAcessoADM() {
    const loginParaBusca = usuarioUsername.trim();

    if (loginParaBusca === "DESCONHECIDO") {
        window.location.href = "index.html";
        return;
    }

    try {
        // Como o seu auth.js salva o documento pelo UID, precisamos fazer uma QUERY
        // para achar o documento onde o campo 'username' seja igual ao nosso login
        const q = query(collection(db, "users"), where("username", "==", loginParaBusca));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const dadosUser = querySnapshot.docs[0].data();

            // EXIBIÇÃO: Mostra o DBRITO no canto superior
            if (document.getElementById('user-display')) {
                document.getElementById('user-display').innerText = dadosUser.username;
            }

            // SEGURANÇA: Verifica se é ADM
            if (dadosUser.nivelAcesso !== "ADM") {
                alert("ACESSO NEGADO: Somente administradores.");
                window.location.href = "portal.html";
            }

            console.log("Autenticado como ADM:", dadosUser.username);

        } else {
            console.error("Usuário não encontrado no Firestore:", loginParaBusca);
            alert(`Usuário "${loginParaBusca}" não encontrado.`);
            window.location.href = "index.html";
        }
    } catch (error) {
        console.error("Erro na validação:", error);
        window.location.href = "index.html";
    }
}

const getDataBR = () => {
    const d = new Date();
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
};

// --- CONFIGURAÇÃO INICIAL ---
// Chamamos a verificação logo de cara
verificarAcessoADM();

document.getElementById('dataAgendamento').value = getDataBR();
document.getElementById('buscaInicio').value = getDataBR();
document.getElementById('buscaFim').value = getDataBR();

const getCoresPorTipo = (tipo) => {
    const t = (tipo || "").toUpperCase();
    if (['ARMARIO', 'COMODA', 'PAINEL', 'MULTIUSO', 'MODULO', 'COZINHA', 'ROUPEIRO'].some(x => t.includes(x))) return { bg: '#FFFF00', text: '#000000', rgb: [255, 255, 0] };
    if (t.includes('MESA')) return { bg: '#4CAF50', text: '#FFFFFF', rgb: [76, 175, 80] };
    if (['CELULAR', 'TABLET', 'RELOGIO', 'NOTEBOOK'].some(x => t.includes(x))) return { bg: '#00BFFF', text: '#FFFFFF', rgb: [0, 191, 255] };
    return { bg: '#FFFFFF', text: '#000000', rgb: [255, 255, 255] };
};

// --- GERAÇÃO DE SENHA ROBUSTA (CONSULTA COMPLETA AO BANCO) ---
async function gerarSenha() {
    try {
        // Busca TODOS os agendamentos cadastrados no Firestore
        const snap = await getDocs(collection(db, "agendamentos"));
        let maiorNum = 0;

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const senha = data.senhaAgendamento || docSnap.id;

            // Extrai a parte numérica antes do hífen (ex: "05-MS" -> 5)
            if (senha && senha.includes('-')) {
                const num = parseInt(senha.split('-')[0], 10);
                if (!isNaN(num) && num > maiorNum) {
                    maiorNum = num;
                }
            }
        });

        // Garante que a próxima senha seja exatamente o Maior Número + 1
        const proximaSenha = String(maiorNum + 1).padStart(2, '0') + "-MS";
        document.getElementById('senhaAgendamento').value = proximaSenha;
        return proximaSenha;
    } catch (error) {
        console.error("Erro ao gerar senha com consulta completa:", error);
        return "01-MS";
    }
}

// --- SALVAR/RASCUNHO COM GARANTIA ABSOLUTA CONTRA SOBRESCRITA ---
async function salvarAgenda(status) {
    if (localStorage.getItem('usuarioNome') !== usuarioNome) {
        alert("Tentativa de alteração de identidade detectada!");
        return;
    }

    let senha = document.getElementById('senhaAgendamento').value;
    const fornecedor = document.getElementById('selectFornecedor').value;
    if (!fornecedor) return alert("Selecione um fornecedor!");

    const isEdicao = document.getElementById('btnAtualizar').style.display === 'inline-block' ||
        (document.getElementById('btnAtualizarRascunho') && document.getElementById('btnAtualizarRascunho').style.display === 'inline-block');

    // SE FOR UM NOVO AGENDAMENTO: TRAVA DE SEGURANÇA CONTRA SENHA DUPLICADA OU EXISTENTE
    if (!isEdicao) {
        let docCheck = await getDoc(doc(db, "agendamentos", senha));

        // Se a senha por algum motivo já existir no Firestore, recalcula o maior número em tempo real
        while (docCheck.exists()) {
            console.warn(`A senha ${senha} já existe no banco. Recalculando maior sequência...`);
            senha = await gerarSenha();
            docCheck = await getDoc(doc(db, "agendamentos", senha));
        }
    }

    const dados = {
        senhaAgendamento: senha,
        data: document.getElementById('dataAgendamento').value,
        central: document.getElementById('central').value,
        fornecedor: fornecedor,
        cargas: document.getElementById('cargas').value,
        pedido: document.getElementById('pedido').value,
        tipoProduto: document.getElementById('tipoProduto').value.toUpperCase(),
        linhaSeparacao: document.getElementById('linhaSeparacao').value,
        status: status,
        composicao: itensCargaTmp,
        timestamp: serverTimestamp(),
        usuario: usuarioUsername
    };

    try {
        await setDoc(doc(db, "agendamentos", senha), dados, { merge: true });

        await addDoc(collection(db, "historico"), {
            usuario: usuarioUsername,
            acao: status === "Rascunho" ? "SALVO COMO RASCUNHO" : "AGENDAMENTO DEFINITIVO",
            detalhe: `Fornecedor: ${fornecedor} | Cargas: ${dados.cargas} | Pedido: ${dados.pedido}`,
            senha: senha,
            dataHora: serverTimestamp()
        });

        alert(`Sucesso! Agendamento registrado sob a Senha: ${senha}`);
        resetaForm();
    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao processar operação.");
    }
}

window.copiarRascunhosSelecionados = () => {
    const selecionados = Array.from(document.querySelectorAll('#corpoRascunhos .check-copy-rascunho:checked'));
    if (selecionados.length === 0) return alert("Selecione os rascunhos!");

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
        const senha = tr.cells[1].innerText.trim();
        
        // Pega o valor da data diretamente do input type="date"
        const inputData = tr.cells[2].querySelector('input[type="date"]');
        let dataFormatada = "";
        
        if (inputData && inputData.value) {
            // Formata YYYY-MM-DD para DD/MM/YYYY
            dataFormatada = inputData.value.split('-').reverse().join('/');
        } else {
            dataFormatada = tr.cells[2].innerText.trim();
        }

        const central = tr.cells[3].innerText.trim();
        const cargas = tr.cells[4].innerText.trim();

        html += `
            <tr>
                <td style="border: 1px solid #000000; padding: 6px 12px; background-color: #b4c6e7; text-align: center;">
                    ${senha}
                </td>
                <td style="border: 1px solid #000000; padding: 6px 12px; text-align: center;">
                    ${dataFormatada}
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

window.toggleSelectAll = (el) => {
    // Seleciona apenas os checkboxes que estão visíveis na tabela de agendamentos definitivos
    const checkboxes = document.querySelectorAll('#corpoTabela .check-export');
    checkboxes.forEach(c => c.checked = el.checked);
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
                styles: { fontSize: 8, halign: 'center', cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1 },
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
            styles: { fontSize: 8, halign: 'center', cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1 },
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

// --- LISTENER PARA IMPORTAR APENAS A COMPOSIÇÃO DE UMA CARGA INDIVIDUAL ---
const inputExcelIndividual = document.getElementById('inputExcel');
if (inputExcelIndividual) {
    inputExcelIndividual.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                const rows = XLSX.utils.sheet_to_json(worksheet);

                // Limpa a composição anterior antes de carregar a nova
                itensCargaTmp = [];

                rows.forEach(row => {
                    // Mapeia todas as variações possíveis de nomes de coluna que possam vir do Excel
                    const codItem = row.Cod_Item || row['Cód. Item'] || row['Cód Item'] || row.Codigo || row.codigo;
                    const descricao = row.Descricao || row['Descrição'] || row.DescricaoProduto || row.descricao;
                    const qtd = row.Qtd || row.Quantidade || row['Qtd.'] || row.qtd;

                    // Adiciona o item se houver código ou descrição válidos
                    if (codItem || descricao) {
                        itensCargaTmp.push({
                            codigo: String(codItem || "N/A").trim(),
                            descricao: String(descricao || "SEM DESCRIÇÃO").toUpperCase().trim(),
                            qtd: parseInt(qtd || 0)
                        });
                    }
                });

                if (itensCargaTmp.length > 0) {
                    alert(`Sucesso! ${itensCargaTmp.length} itens foram carregados na memória desta carga.\nClique em "FINALIZAR AGENDAMENTO" ou "SALVAR COMO RASCUNHO" para gravar definitivamente no banco.`);
                } else {
                    alert("Atenção: Nenhuns itens válidos foram localizados na planilha. Verifique os cabeçalhos.");
                    e.target.value = "";
                }
            } catch (err) {
                console.error("Erro ao ler composição individual:", err);
                alert("Erro ao processar o arquivo Excel.");
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

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

// --- FILTRO E BUSCA GLOBAL EXPANDIDA (INCLUINDO COMPOSIÇÃO) ---
function carregarDados() {
    onSnapshot(query(collection(db, "agendamentos"), orderBy("timestamp", "desc")), (snap) => {
        const emEdicao = document.getElementById('btnAtualizar').style.display === 'inline-block';
        const modalAberto = Array.from(document.querySelectorAll('.modal')).some(m => m.style.display === 'flex' || m.style.display === 'block');

        if (emEdicao || modalAberto) return;

        const corpo = document.getElementById('corpoTabela');
        const rascunhos = document.getElementById('corpoRascunhos');
        const dIni = document.getElementById('buscaInicio').value;
        const dFim = document.getElementById('buscaFim').value;
        const termo = document.getElementById('buscaGeral').value.toLowerCase().trim();

        corpo.innerHTML = "";
        rascunhos.innerHTML = "";
        let totalCargas = 0;

        snap.forEach(d => {
            const ag = d.data();
            const cores = getCoresPorTipo(ag.tipoProduto);
            const dataFormat = ag.data ? ag.data.split('-').reverse().join('/') : '-';

            // Tratamento de ponta para busca e filtro
            const centralTratada = limparEspacos(ag.central).toUpperCase();
            const fornecedorTratado = limparEspacos(ag.fornecedor).toUpperCase();
            const tipoTratado = limparEspacos(ag.tipoProduto).toUpperCase();
            const linhaTratada = limparEspacos(ag.linhaSeparacao).toUpperCase();

            // Verificação de Filtros Ativos das Colunas
            let passaFiltroColuna = true;
            for (const key in filtrosColunas) {
                if (filtrosColunas[key].length > 0) {
                    const valRegistro = limparEspacos(ag[key]).toUpperCase();
                    if (!filtrosColunas[key].includes(valRegistro)) {
                        passaFiltroColuna = false;
                        break;
                    }
                }
            }

            // Pesquisa ampla na Composição (Código e Descrição)
            const atendeComposicao = (ag.composicao || []).some(item => 
                (item.codigo && String(item.codigo).toLowerCase().includes(termo)) ||
                (item.descricao && String(item.descricao).toLowerCase().includes(termo))
            );

            // Pesquisa Global Expandida por todas as colunas
            const atendeBuscaGeral = termo === "" || (
                (ag.senhaAgendamento && String(ag.senhaAgendamento).toLowerCase().includes(termo)) ||
                (ag.data && dataFormat.toLowerCase().includes(termo)) ||
                (ag.central && String(ag.central).toLowerCase().includes(termo)) ||
                (ag.cargas && String(ag.cargas).toLowerCase().includes(termo)) ||
                (ag.pedido && String(ag.pedido).toLowerCase().includes(termo)) ||
                (ag.fornecedor && String(ag.fornecedor).toLowerCase().includes(termo)) ||
                (ag.tipoProduto && String(ag.tipoProduto).toLowerCase().includes(termo)) ||
                (ag.linhaSeparacao && String(ag.linhaSeparacao).toLowerCase().includes(termo)) ||
                atendeComposicao
            );

            const atendeBusca = passaFiltroColuna && atendeBuscaGeral;

            const badgeTipo = `<span style="background-color: ${cores.bg}; color: ${cores.text}; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">${ag.tipoProduto}</span>`;

            const btnAcoes = `
                <button onclick="verComp('${ag.senhaAgendamento}')" title="Ver Itens" style="border:none; background:none; cursor:pointer;"><i class="fas fa-boxes" style="color: #212121;"></i></button>
                <button onclick="editarAg('${ag.senhaAgendamento}')" title="Editar" style="border:none; background:none; cursor:pointer;"><i class="fas fa-edit" style="color: #212121;"></i></button>
            `;

            const gerarLinha = (classeCheck) => {
                const celulaData = ag.status === "Rascunho"
                    ? `<input type="date" value="${ag.data}" onchange="alterarDataRascunho('${ag.senhaAgendamento}', this.value)" style="border: 1px solid #ccc; border-radius: 4px; padding: 2px 4px; font-weight: bold; cursor: pointer;">`
                    : `<span style="color: #212121;">${dataFormat}</span>`;

                return `
        <tr style="color: #212121;">
            <td><input type="checkbox" class="${classeCheck}" value="${ag.senhaAgendamento}"></td>
            <td><b style="color: #D32F2F;">${ag.senhaAgendamento}</b></td>
            <td>${celulaData}</td>
            <td style="font-weight:bold; color: #212121;">${centralTratada}</td>
            <td style="color: #212121;">${ag.cargas || '-'}</td>
            <td style="color: #212121;">${ag.pedido || '-'}</td>
            <td style="font-weight:bold; color: #212121;">${fornecedorTratado}</td>
            <td>${badgeTipo}</td>
            <td style="font-weight: bold; color: #212121;">${linhaTratada || '-'}</td>
            <td>
                ${ag.status === "Rascunho" ? `<button onclick="finalizarDireto('${ag.senhaAgendamento}')" title="Finalizar" style="color:green; border:none; background:none; cursor:pointer; margin-right:8px;"><i class="fas fa-check-circle"></i></button>` : ''}
                ${btnAcoes}
            </td>
        </tr>`;
            };

            if (ag.status === "Rascunho") {
                if (atendeBusca) rascunhos.innerHTML += gerarLinha("check-copy-rascunho");
            } else {
                if (ag.data >= dIni && ag.data <= dFim && atendeBusca) {
                    corpo.innerHTML += gerarLinha("check-export");
                    totalCargas++;
                }
            }
        });

        const spanTotal = document.getElementById('totalCargasAgendadas');
        if (spanTotal) spanTotal.innerText = totalCargas;

        atualizarIconesFiltro();
    });
}

window.finalizarDireto = async (senha) => {
    if (confirm(`Confirmar agendamento definitivo da carga ${senha}?`)) {
        await updateDoc(doc(db, "agendamentos", senha), { status: "Agendada", timestamp: serverTimestamp() });

        // Salva a ação na coleção historico
        await addDoc(collection(db, "historico"), {
            usuario: usuarioUsername,
            acao: "AGENDAMENTO DEFINITIVO",
            detalhe: `Carga alterada de Rascunho para definitivo (Agendada).`,
            senha: senha,
            dataHora: serverTimestamp()
        });
    }
};

window.resetaForm = () => {
    document.getElementById('central').value = "Selecione...";
    document.getElementById('pedido').value = "";
    document.getElementById('cargas').value = "";
    document.getElementById('tipoProduto').value = "";
    document.getElementById('inputExcel').value = "";
    document.getElementById('linhaSeparacao').value = "Selecione...";
    document.getElementById('selectFornecedor').value = "";
    itensCargaTmp = [];
    // Volta para o estado inicial
    document.getElementById('btnSalvar').style.display = 'block';
    document.getElementById('btnRascunho').style.display = 'block';

    // Esconde os botões de edição
    document.getElementById('btnAtualizar').style.display = 'none';
    if (document.getElementById('btnAtualizarRascunho')) document.getElementById('btnAtualizarRascunho').style.display = 'none';
    if (document.getElementById('btnCancelarEdicao')) document.getElementById('btnCancelarEdicao').style.display = 'none';

    gerarSenha();
};

window.fecharModais = () => document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');

window.verComp = async (senha) => {
    senhaAbertaNoModal = senha;
    const docSnap = await getDoc(doc(db, "agendamentos", senha));
    if (!docSnap.exists()) return;

    const dados = docSnap.data();

    // 1. Salvamos os dados no array temporário
    window.tempComposicao = [...(dados.composicao || [])];

    // 2. Chamamos a função que você já tem para desenhar a lista E calcular o total
    // Isso garante que o TOTAL: X apareça correto assim que o modal abrir
    renderizarItensModal();

    // 3. Abre o modal
    const modal = document.getElementById('modalComposicao');
    if (modal) modal.style.display = 'block';
};

// Atualiza o array em memória enquanto o usuário digita
window.atualizarArrayLocal = (index, campo, valor) => {
    // Atualiza o valor no array (convertendo para número se for quantidade)
    window.tempComposicao[index][campo] = campo === 'qtd' ? parseInt(valor || 0) : valor.toUpperCase();

    // Se o usuário mexeu na quantidade, recalculamos o total na tela imediatamente
    if (campo === 'qtd') {
        let novoTotal = 0;
        window.tempComposicao.forEach(item => {
            novoTotal += (parseInt(item.qtd) || 0);
        });

        const spanTotal = document.getElementById('totalPecas');
        if (spanTotal) spanTotal.innerText = novoTotal;
    }
};

// Remove do array em memória e atualiza a tela do modal
window.removerItemComposicao = (index) => {
    if (confirm("Deseja remover este item?")) {
        window.tempComposicao.splice(index, 1);
        renderizarItensModal(); // Função simples para reler window.tempComposicao
    }
};

// Salva as alterações da composição no Firestore
window.confirmarEdicaoItens = async () => {
    try {
        const docRef = doc(db, "agendamentos", senhaAbertaNoModal);
        await updateDoc(docRef, {
            composicao: window.tempComposicao
        });

        // Salva a ação na coleção historico
        await addDoc(collection(db, "historico"), {
            usuario: usuarioUsername,
            acao: "EDIÇÃO DE COMPOSIÇÃO DE ITENS",
            detalhe: `Atualizada a composição de itens. Qtd de produtos diferentes: ${window.tempComposicao.length}`,
            senha: senhaAbertaNoModal,
            dataHora: serverTimestamp()
        });

        alert("Composição atualizada com sucesso!");
        document.getElementById('modalComposicao').style.display = 'none';
    } catch (e) {
        console.error("Erro ao atualizar itens:", e);
        alert("Erro ao salvar alterações.");
    }
};

// Função para adicionar item manualmente dentro do modal de edição
window.adicionarItemManual = () => {
    const codInput = document.getElementById('itemCod');
    const descInput = document.getElementById('itemDesc');
    const qtdInput = document.getElementById('itemQtd');

    const codigo = codInput.value.trim();
    const descricao = descInput.value.toUpperCase().trim();
    const qtd = parseInt(qtdInput.value);

    if (!codigo || !descricao || isNaN(qtd)) {
        return alert("Preencha código, descrição e quantidade corretamente!");
    }

    // Adiciona ao array temporário que o seu verComp já criou
    window.tempComposicao.push({
        codigo: codigo,
        descricao: descricao,
        qtd: qtd
    });

    // Limpa os campos de entrada
    codInput.value = "";
    descInput.value = "";
    qtdInput.value = "";

    // Atualiza a tela do modal para mostrar o novo item
    renderizarItensModal();
};

// Função auxiliar para redesenhar a lista no modal (Necessária para o Adicionar e o Remover)
window.renderizarItensModal = () => {
    const listaComp = document.getElementById('listaComposicaoModal');
    if (!listaComp) return;

    listaComp.innerHTML = "";
    let total = 0;

    window.tempComposicao.forEach((item, index) => {
        total += (item.qtd || 0);
        listaComp.innerHTML += `
            <div style="display: flex; gap: 5px; margin-bottom: 8px; align-items: center; background: rgba(255,255,255,0.1); padding: 5px; border-radius: 5px;">
                <input type="text" value="${item.codigo}" onchange="atualizarArrayLocal(${index}, 'codigo', this.value)" style="width: 80px;" placeholder="Cód">
                <input type="text" value="${item.descricao}" onchange="atualizarArrayLocal(${index}, 'descricao', this.value)" style="flex: 1;" placeholder="Descrição">
                <input type="number" value="${item.qtd}" onchange="atualizarArrayLocal(${index}, 'qtd', this.value)" style="width: 60px;" placeholder="Qtd">
                <button onclick="removerItemComposicao(${index})" style="color: #ff4d4d; background: none; border: none; cursor: pointer;"><i class="fas fa-trash"></i></button>
            </div>
        `;
    });

    // Atualiza o contador de total de peças no modal
    if (document.getElementById('totalPecas')) {
        document.getElementById('totalPecas').innerText = total;
    }
};

window.editarAg = async (senha) => {
    const snap = await getDocs(collection(db, "agendamentos"));
    const d = snap.docs.find(x => x.id === senha).data();

    document.getElementById('senhaAgendamento').value = d.senhaAgendamento;
    document.getElementById('dataAgendamento').value = d.data;
    document.getElementById('central').value = d.central;
    document.getElementById('selectFornecedor').value = d.fornecedor;
    document.getElementById('tipoProduto').value = d.tipoProduto;
    document.getElementById('pedido').value = d.pedido || "";
    document.getElementById('cargas').value = d.cargas || "";
    document.getElementById('linhaSeparacao').value = d.linhaSeparacao || "Selecione..."; // ADICIONAR ISSO

    itensCargaTmp = d.composicao || [];

    // Alterna visibilidade dos botões
    document.getElementById('btnSalvar').style.display = 'none';
    document.getElementById('btnRascunho').style.display = 'none';

    // Mostra as 3 opções de edição
    document.getElementById('btnAtualizar').style.display = 'inline-block'; // Salvar Definitivo
    if (document.getElementById('btnAtualizarRascunho'))
        document.getElementById('btnAtualizarRascunho').style.display = 'inline-block'; // Atualizar Rascunho
    if (document.getElementById('btnCancelarEdicao'))
        document.getElementById('btnCancelarEdicao').style.display = 'inline-block'; // Cancelar

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- FORNECEDORES (Ajustado com Ordenação Alfabética de A a Z) ---
async function carregarFornecedores() {
    // Importamos a função 'orderBy' necessária para classificar de A a Z
    const { orderBy } = await import("https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js");

    // Adicionamos o query() com orderBy("nome", "asc") para classificar em ordem alfabética
    onSnapshot(query(collection(db, "fornecedores"), orderBy("nome", "asc")), (snap) => {
        const select = document.getElementById('selectFornecedor');
        const lista = document.getElementById('listaForn');
        select.innerHTML = '<option value="">Selecione...</option>';
        lista.innerHTML = "";
        snap.forEach(d => {
            const f = d.data().nome;
            select.innerHTML += `<option value="${f}">${f}</option>`;
            lista.innerHTML += `<li style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">${f} <i class="fas fa-trash" style="color:red; cursor:pointer;" onclick="removerForn('${d.id}')"></i></li>`;
        });
    });
}
window.abrirFornecedor = () => document.getElementById('modalFornecedor').style.display = 'flex';
document.getElementById('btnAddForn').onclick = async () => {
    const nome = document.getElementById('nomeNovoForn').value.toUpperCase().trim();
    if (nome) await addDoc(collection(db, "fornecedores"), { nome });
    document.getElementById('nomeNovoForn').value = "";
};
window.removerForn = async (id) => { if (confirm("Excluir?")) await deleteDoc(doc(db, "fornecedores", id)); };

window.cancelarEdicao = () => {
    if (confirm("Deseja cancelar a edição? As alterações não salvas serão perdidas.")) {
        resetaForm();
    }
};

// --- LISTENERS ---
// Ação de Salvar Novo (quando não está editando)
document.getElementById('btnSalvar').onclick = () => salvarAgenda("Agendada");
document.getElementById('btnRascunho').onclick = () => salvarAgenda("Rascunho");

// Ações de Edição (Aparecem após clicar em Editar)
// 1. Salvar Definitivo (Muda para agendada)
document.getElementById('btnAtualizar').onclick = () => salvarAgenda("Agendada");

// 2. Atualizar Rascunho (Mantém como rascunho)
// Se você criar um botão com id="btnAtualizarRascunho" no HTML:
const btnAtuRascunho = document.getElementById('btnAtualizarRascunho');
if (btnAtuRascunho) {
    btnAtuRascunho.onclick = () => salvarAgenda("Rascunho");
}

// 3. Cancelar Edição
const btnCancel = document.getElementById('btnCancelarEdicao');
if (btnCancel) {
    btnCancel.onclick = () => cancelarEdicao();
}
document.getElementById('buscaGeral').oninput = carregarDados;
document.getElementById('buscaInicio').onchange = carregarDados;
document.getElementById('buscaFim').onchange = carregarDados;

window.addEventListener('DOMContentLoaded', async () => {
    await verificarAcessoADM();
    gerarSenha();
    carregarDados();
    carregarFornecedores();
});

// --- FUNÇÕES DE ORDENAÇÃO DE TABELAS ---

// Função para a tabela Definitiva
window.ordenarTabelaDefinitiva = (indiceColuna) => {
    // Somamos +1 porque a primeira coluna (index 0) é o checkbox
    ordenarLogicaDOM('corpoTabela', indiceColuna + 1);
};

// Função para a tabela Rascunho
window.ordenarTabelaRascunho = (indiceColuna) => {
    // Somamos +1 porque a primeira coluna (index 0) é o checkbox
    ordenarLogicaDOM('corpoRascunhos', indiceColuna + 1);
};

window.ordenarLogicaDOM = (idCorpo, indexReal) => {
    const corpo = document.getElementById(idCorpo);
    const linhas = Array.from(corpo.querySelectorAll('tr'));
    const direcaoAtual = corpo.dataset.direcao === 'asc' ? 'desc' : 'asc';
    corpo.dataset.direcao = direcaoAtual;

    linhas.sort((a, b) => {
        let valA = a.cells[indexReal].innerText.trim().toUpperCase();
        let valB = b.cells[indexReal].innerText.trim().toUpperCase();

        if (indexReal === 2) { // Data
            valA = valA.split('/').reverse().join('');
            valB = valB.split('/').reverse().join('');
        }

        const numA = parseFloat(valA.replace('-', '.'));
        const numB = parseFloat(valB.replace('-', '.'));

        if (!isNaN(numA) && !isNaN(numB)) {
            return direcaoAtual === 'asc' ? numA - numB : numB - numA;
        }

        return direcaoAtual === 'asc' ? valA.localeCompare(valB, 'pt-BR') : valB.localeCompare(valA, 'pt-BR');
    });
    linhas.forEach(linha => corpo.appendChild(linha));
};

// --- TRATAMENTO DE STRING NA IMPORTAÇÃO EM MASSA ---
document.getElementById('inputExcelMassa').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rows = XLSX.utils.sheet_to_json(worksheet);
        const cargasAgrupadas = {};

        rows.forEach(row => {
            if (!row.Cargas && !row.Pedido) return;

            const chave = `${row.Cargas}_${row.Pedido}_${row.Data}`;

            if (!cargasAgrupadas[chave]) {
                cargasAgrupadas[chave] = {
                    data: row.Data,
                    central: limparEspacos(row.Central || "N/A"),
                    cargas: limparEspacos(row.Cargas || "N/A"),
                    pedido: limparEspacos(row.Pedido || "N/A"),
                    fornecedor: limparEspacos(row.Fornecedor || "N/A"),
                    tipo: limparEspacos(row.Tipo || "DIVERSOS"),
                    linhaSeparacao: limparEspacos(row.linhaSeparacao || "EMBALADO"),
                    composicao: []
                };
            }

            if (row.Cod_Item || row.Descricao) {
                cargasAgrupadas[chave].composicao.push({
                    codigo: limparEspacos(row.Cod_Item || "N/A"),
                    descricao: limparEspacos(row.Descricao || "SEM DESCRIÇÃO").toUpperCase(),
                    qtd: parseInt(row.Qtd || 0)
                });
            }
        });

        let contador = 0;

        try {
            for (const chave in cargasAgrupadas) {
                const info = cargasAgrupadas[chave];
                const proximaSenha = await gerarSenhaParaMassa();

                const dados = {
                    senhaAgendamento: proximaSenha,
                    data: converterDataExcel(info.data),
                    central: info.central.toUpperCase(),
                    fornecedor: info.fornecedor.toUpperCase(),
                    cargas: info.cargas,
                    pedido: info.pedido,
                    tipoProduto: info.tipo.toUpperCase(),
                    linhaSeparacao: info.linhaSeparacao.toUpperCase(),
                    status: "Rascunho",
                    composicao: info.composicao,
                    timestamp: serverTimestamp(),
                    usuario: usuarioUsername
                };

                await setDoc(doc(db, "agendamentos", proximaSenha), dados);

                await addDoc(collection(db, "historico"), {
                    usuario: usuarioUsername,
                    acao: "IMPORTAÇÃO EM MASSA (EXCEL)",
                    detalhe: `Carga importada via planilha. Fornecedor: ${dados.fornecedor} | Cargas: ${dados.cargas}`,
                    senha: proximaSenha,
                    dataHora: serverTimestamp()
                });

                contador++;
            }
            alert(`${contador} agendamentos importados com sucesso como RASCUNHO!`);
            e.target.value = "";
        } catch (error) {
            console.error("Erro na importação:", error);
            alert("Erro ao importar dados. Verifique o console.");
        }
    };
    reader.readAsArrayBuffer(file);
});

// --- GERAR SENHA SEQUENCIAL SEGURA PARA IMPORTAÇÃO EM MASSA ---
async function gerarSenhaParaMassa() {
    return await gerarSenha();
}

// Função para tratar a data que vem do Excel (pode vir como número ou string)
function converterDataExcel(dataExcel) {
    if (!dataExcel) return getDataBR();

    // Se a data vier no formato DD/MM/YYYY
    if (typeof dataExcel === 'string' && dataExcel.includes('/')) {
        const partes = dataExcel.split('/');
        return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }

    // Se vier como número serial do Excel
    if (typeof dataExcel === 'number') {
        const date = new Date((dataExcel - 25569) * 86400 * 1000);
        return date.toISOString().split('T')[0];
    }

    return dataExcel; // Retorna o que vier se já estiver no padrão YYYY-MM-DD
}

// Função para abrir/fechar o menu de exportação
window.toggleDropdownExport = () => {
    const menu = document.getElementById('menuExport');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
};

// Fecha os menus dropdowns de exportação se clicar fora deles
window.onclick = function (event) {
    if (!event.target.matches('.btn-exp') && !event.target.matches('.fa-share-alt') && !event.target.matches('.fa-caret-down')) {
        const menuMain = document.getElementById('menuExport');
        const menuRascunho = document.getElementById('menuExportRascunho');

        if (menuMain && menuMain.style.display === 'block') {
            menuMain.style.display = 'none';
        }
        if (menuRascunho && menuRascunho.style.display === 'block') {
            menuRascunho.style.display = 'none';
        }
    }
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

// --- NOVAS FUNÇÕES PARA TABELA DE RASCUNHOS ---

// 1. Selecionar Todos os Rascunhos
window.toggleSelectAllRascunhos = (el) => {
    const checkboxes = document.querySelectorAll('#corpoRascunhos .check-copy-rascunho');
    checkboxes.forEach(c => c.checked = el.checked);
};

// 2. Finalizar Selecionados em Massa
window.finalizarRascunhosSelecionados = async () => {
    const selecionados = Array.from(document.querySelectorAll('#corpoRascunhos .check-copy-rascunho:checked')).map(c => c.value);

    if (selecionados.length === 0) {
        return alert("Selecione ao menos um rascunho para finalizar!");
    }

    if (confirm(`Deseja confirmar e finalizar definitivamente os ${selecionados.length} rascunhos selecionados?`)) {
        try {
            for (const senha of selecionados) {
                await updateDoc(doc(db, "agendamentos", senha), {
                    status: "Agendada",
                    timestamp: serverTimestamp()
                });

                await addDoc(collection(db, "historico"), {
                    usuario: usuarioUsername,
                    acao: "AGENDAMENTO DEFINITIVO (EM LOTE)",
                    detalhe: `Carga alterada de Rascunho para definitivo em lote.`,
                    senha: senha,
                    dataHora: serverTimestamp()
                });
            }
            alert(`${selecionados.length} rascunho(s) finalizado(s) com sucesso!`);

            // Desmarca o checkbox do cabeçalho
            const chkAll = document.getElementById('selectAllRascunhos');
            if (chkAll) chkAll.checked = false;

        } catch (error) {
            console.error("Erro ao finalizar rascunhos em lote:", error);
            alert("Ocorreu um erro ao finalizar alguns rascunhos.");
        }
    }
};

// 3. Abrir/Fechar o Menu de Exportação dos Rascunhos
window.toggleDropdownExportRascunho = () => {
    const menu = document.getElementById('menuExportRascunho');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
};

// 4. Exportar PDF dos Rascunhos
window.exportarPDFRascunho = async (modo) => {
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF('p', 'mm', 'a4');

    const selecionados = Array.from(document.querySelectorAll('#corpoRascunhos .check-copy-rascunho:checked')).map(c => c.value);
    if (selecionados.length === 0) return alert("Selecione rascunhos para exportar!");

    const snap = await getDocs(collection(db, "agendamentos"));
    const agendasMap = {};
    snap.forEach(d => { agendasMap[d.id] = d.data(); });
    const agendas = selecionados.map(id => agendasMap[id]).filter(a => a !== undefined);

    docPdf.setFillColor(192, 0, 0);
    docPdf.rect(0, 0, 210, 25, 'F');
    docPdf.setFontSize(18);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text("MÓVEIS SIMONETTI - LOGÍSTICA (RASCUNHOS)", 14, 16);

    docPdf.setFontSize(10);
    docPdf.setTextColor(0, 0, 0);
    docPdf.text(`TOTAL DE RASCUNHOS: ${agendas.length}`, 14, 32);
    docPdf.setTextColor(100);
    docPdf.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 145, 32);

    let currentY = 38;

    if (modo === 'completo') {
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
                styles: { fontSize: 8, halign: 'center', cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1 },
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
                currentY = docPdf.lastAutoTable.finalY + 10;
            } else {
                currentY += 8;
            }
        });
    } else {
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
            styles: { fontSize: 8, halign: 'center', cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1 },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 5) {
                    const estilo = getCoresPorTipo(data.cell.raw);
                    data.cell.styles.fillColor = estilo.rgb;
                    data.cell.styles.textColor = estilo.text;
                }
            }
        });
    }

    docPdf.save(`Rascunhos_Simonetti_${modo.toUpperCase()}.pdf`);
};

// 5. Exportar Excel dos Rascunhos
window.exportarExcelRascunho = async (modo) => {
    const selecionados = Array.from(document.querySelectorAll('#corpoRascunhos .check-copy-rascunho:checked')).map(c => c.value);
    if (selecionados.length === 0) return alert("Selecione rascunhos para exportar!");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rascunhos');

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
                aplicarEstiloCelulaRascunho(row, d.tipoProduto);
            });
        } else {
            const row = worksheet.addRow(base);
            aplicarEstiloCelulaRascunho(row, d.tipoProduto);
        }

        dataAnterior = dataFormatada;
    });

    function aplicarEstiloCelulaRascunho(row, tipo) {
        row.eachCell({ includeEmpty: false }, (cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        const estilo = getCoresPorTipo(tipo);
        const cellTipo = row.getCell('Tipo');
        const hexBg = estilo.bg.replace('#', '');
        cellTipo.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: hexBg }
        };
        cellTipo.font = { color: { argb: estilo.text === '#FFFFFF' ? 'FFFFFF' : '000000' }, bold: true };
    }

    worksheet.getRow(1).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '607D8B' } }; // Azul acinzentado característico do rascunho
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
    a.download = `Simonetti_Rascunhos_${modo.toUpperCase()}.xlsx`;
    a.click();
};

window.excluirRascunhosSelecionados = async () => {
    // 1. Coleta os rascunhos marcados pelos checkboxes
    const selecionados = Array.from(document.querySelectorAll('#corpoRascunhos .check-copy-rascunho:checked')).map(c => c.value);

    // 2. Erro se nada estiver selecionado
    if (selecionados.length === 0) {
        return alert("Erro: Nada selecionado! Marque ao menos um rascunho para excluir.");
    }

    // 3. Aviso de confirmação de segurança
    const confirmacao = confirm(`Atenção: Deseja realmente excluir ${selecionados.length} rascunho(s) selecionado(s)? Esta ação não poderá ser desfeita.`);
    if (!confirmacao) return;

    try {
        for (const senha of selecionados) {
            // Busca dados da agenda para gravar detalhes no histórico antes de remover
            const docSnap = await getDoc(doc(db, "agendamentos", senha));
            let detalheCarga = "Rascunho Excluído";

            if (docSnap.exists()) {
                const d = docSnap.data();
                detalheCarga = `Fornecedor: ${d.fornecedor} | Cargas: ${d.cargas || '-'} | Pedido: ${d.pedido || '-'}`;
            }

            // Exclui o documento do Firestore
            await deleteDoc(doc(db, "agendamentos", senha));

            // Grava o log no banco de dados de Histórico no padrão existente
            await addDoc(collection(db, "historico"), {
                usuario: usuarioUsername,
                acao: "EXCLUSÃO DE RASCUNHO",
                detalhe: detalheCarga,
                senha: senha,
                dataHora: serverTimestamp()
            });
        }

        alert(`${selecionados.length} rascunho(s) excluído(s) com sucesso!`);

        // Desmarca checkbox 'Selecionar Todos'
        const chkAll = document.getElementById('selectAllRascunhos');
        if (chkAll) chkAll.checked = false;

    } catch (error) {
        console.error("Erro ao excluir rascunhos:", error);
        alert("Ocorreu um erro ao tentar excluir os rascunhos.");
    }
};

// --- ESTRUTURA DE FILTROS MÚLTIPLOS (EFEITO CASCATA) ---
let filtrosColunas = {
    central: [],
    fornecedor: [],
    tipoProduto: [],
    linhaSeparacao: []
};

// --- LIMPEZA DE ESPAÇOS EM BRANCO NAS STRINGS ---
const limparEspacos = (valor) => String(valor || "").trim().replace(/\s+/g, " ");

// --- ATUALIZAÇÃO DOS ÍCONES DE FILTRO E DADOS DAS TABELAS ---
function atualizarIconesFiltro() {
    const campos = ['central', 'fornecedor', 'tipoProduto', 'linhaSeparacao'];
    campos.forEach(campo => {
        const icone = document.getElementById(`icon-filtro-${campo}`);
        if (icone) {
            if (filtrosColunas[campo] && filtrosColunas[campo].length > 0) {
                icone.style.color = '#D32F2F'; // Vermelho quando ativo
                icone.classList.add('filtro-ativo');
            } else {
                icone.style.color = 'inherit'; // Cor padrão
                icone.classList.remove('filtro-ativo');
            }
        }
    });
}

let campoFiltroAtual = null;

// --- MODAL DE FILTRO INTELIGENTE COM OPÇÕES DE ORDENAÇÃO A-Z / Z-A ---
let ordemFiltroModal = 'ASC'; // Variável global para controle da ordenação das opções

window.abrirModalFiltroColuna = async (campo) => {
    campoFiltroAtual = campo;
    ordemFiltroModal = 'ASC'; // Define por padrão A-Z ao abrir
    const dIni = document.getElementById('buscaInicio').value;
    const dFim = document.getElementById('buscaFim').value;

    if (document.getElementById('lblDataIni')) {
        document.getElementById('lblDataIni').innerText = dIni.split('-').reverse().join('/');
    }
    if (document.getElementById('lblDataFim')) {
        document.getElementById('lblDataFim').innerText = dFim.split('-').reverse().join('/');
    }

    const titulos = {
        central: "Filtrar por Central",
        fornecedor: "Filtrar por Fornecedor",
        tipoProduto: "Filtrar por Tipo de Produto",
        linhaSeparacao: "Filtrar por Linha de Separação"
    };

    document.getElementById('tituloModalFiltro').innerText = titulos[campo] || "Filtrar Opções";

    await renderizarOpcoesModalFiltro();
    document.getElementById('modalFiltroColuna').style.display = 'block';
};

// Renderiza as opções do modal aplicando a ordem definida (A-Z ou Z-A)
async function renderizarOpcoesModalFiltro() {
    const dIni = document.getElementById('buscaInicio').value;
    const dFim = document.getElementById('buscaFim').value;
    const snap = await getDocs(collection(db, "agendamentos"));
    const opcoesUnicas = new Set();

    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.data >= dIni && d.data <= dFim && d.status !== "Rascunho") {

            let passaOutrosFiltros = true;
            for (const key in filtrosColunas) {
                if (key !== campoFiltroAtual && filtrosColunas[key].length > 0) {
                    const valReg = limparEspacos(d[key]).toUpperCase();
                    if (!filtrosColunas[key].includes(valReg)) {
                        passaOutrosFiltros = false;
                        break;
                    }
                }
            }

            if (passaOutrosFiltros && d[campoFiltroAtual]) {
                opcoesUnicas.add(limparEspacos(d[campoFiltroAtual]).toUpperCase());
            }
        }
    });

    const lista = document.getElementById('listaOpcoesFiltro');
    lista.innerHTML = "";

    if (opcoesUnicas.size === 0) {
        lista.innerHTML = "<li style='padding:10px; color:#999;'>Nenhuma opção encontrada neste período/combinação.</li>";
    } else {
        const valoresJaSelecionados = filtrosColunas[campoFiltroAtual] || [];
        let opcoesArray = Array.from(opcoesUnicas);

        // Aplica Ordenação
        opcoesArray.sort((a, b) => {
            return ordemFiltroModal === 'ASC' 
                ? a.localeCompare(b, 'pt-BR') 
                : b.localeCompare(a, 'pt-BR');
        });

        opcoesArray.forEach(opcao => {
            const checked = valoresJaSelecionados.includes(opcao) ? 'checked' : '';
            lista.innerHTML += `
                <li style="padding: 10px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px; font-weight: bold; color: #212121;">
                    <input type="checkbox" class="chk-filtro-opcao" value="${opcao}" ${checked} style="width: 18px; height: 18px; cursor: pointer;">
                    <span>${opcao}</span>
                </li>`;
        });
    }
}

// Função para alternar ordenação no Modal do Filtro
window.ordenarOpcoesFiltroModal = (direcao) => {
    ordemFiltroModal = direcao;
    renderizarOpcoesModalFiltro();
};

window.toggleSelecionarTodasOpcoesFiltro = (e) => {
    const chks = document.querySelectorAll('.chk-filtro-opcao');
    chks.forEach(chk => chk.checked = e.checked);
};

window.confirmarFiltroColuna = () => {
    const selecionados = Array.from(document.querySelectorAll('.chk-filtro-opcao:checked')).map(c => c.value);
    filtrosColunas[campoFiltroAtual] = selecionados;

    atualizarIconesFiltro();
    fecharModais();
    carregarDados();
};

window.limparFiltroColuna = () => {
    filtrosColunas[campoFiltroAtual] = [];

    atualizarIconesFiltro();
    fecharModais();
    carregarDados();
};

// --- MOVER SELECIONADOS PARA RASCUNHO ---
window.moverSelecionadosParaRascunho = async () => {
    const selecionados = Array.from(document.querySelectorAll('#corpoTabela .check-export:checked')).map(c => c.value);

    if (selecionados.length === 0) {
        return alert("Selecione ao menos um agendamento para mover para rascunho!");
    }

    if (confirm(`Deseja mover os ${selecionados.length} agendamentos selecionados para a lista de Rascunhos?`)) {
        try {
            for (const senha of selecionados) {
                await updateDoc(doc(db, "agendamentos", senha), {
                    status: "Rascunho",
                    timestamp: serverTimestamp()
                });

                await addDoc(collection(db, "historico"), {
                    usuario: usuarioUsername,
                    acao: "ALTERADO PARA RASCUNHO",
                    detalhe: `Agendamento movido da tabela principal para Rascunho.`,
                    senha: senha,
                    dataHora: serverTimestamp()
                });
            }
            alert(`${selecionados.length} agendamento(s) movido(s) para Rascunho com sucesso!`);

            const chkAll = document.getElementById('selectAll');
            if (chkAll) chkAll.checked = false;

        } catch (error) {
            console.error("Erro ao mover para rascunho:", error);
            alert("Ocorreu um erro ao tentar mover os agendamentos.");
        }
    }
};

// Função para atualizar a data do rascunho diretamente no banco sem precisar ir para o formulário
window.alterarDataRascunho = async (senha, novaData) => {
    if (!novaData) return;
    try {
        await updateDoc(doc(db, "agendamentos", senha), {
            data: novaData,
            timestamp: serverTimestamp()
        });

        await addDoc(collection(db, "historico"), {
            usuario: usuarioUsername,
            acao: "ALTERAÇÃO RÁPIDA DE DATA (RASCUNHO)",
            detalhe: `Data alterada no rascunho diretamente na tabela para: ${novaData.split('-').reverse().join('/')}`,
            senha: senha,
            dataHora: serverTimestamp()
        });
    } catch (error) {
        console.error("Erro ao alterar data do rascunho:", error);
        alert("Erro ao atualizar data.");
    }
};
