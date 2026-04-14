/**
 * Módulo de Empenhos - Versão GitHub (sem backend)
 * Funciona 100% no navegador usando localStorage
 */

const ModuloEmpenhos = (() => {
    let empenhosDados = [];
    let empenhosDuplicados = new Map();

    // ========================================================================
    // INICIALIZAÇÃO
    // ========================================================================

    const init = () => {
        console.log('ModuloEmpenhos inicializando...');
        
        // Event listeners
        const inputPdf = document.getElementById('input-pdf');
        const btnProcessar = document.getElementById('btn-processar');
        const btnSalvarTodos = document.getElementById('btn-salvar-todos');
        const btnLimpar = document.getElementById('btn-limpar');
        
        if (inputPdf) inputPdf.addEventListener('change', handleFileSelect);
        if (btnProcessar) btnProcessar.addEventListener('click', processarPDF);
        if (btnSalvarTodos) btnSalvarTodos.addEventListener('click', salvarTodos);
        if (btnLimpar) btnLimpar.addEventListener('click', limpar);

        // Carrega empenhos salvos
        carregarEmpenhos();
        
        console.log('ModuloEmpenhos inicializado!');
    };

    // ========================================================================
    // UPLOAD E PROCESSAMENTO
    // ========================================================================

    const handleFileSelect = (e) => {
        const arquivo = e.target.files[0];
        if (arquivo) {
            const nomeEl = document.getElementById('nome-arquivo');
            if (nomeEl) nomeEl.textContent = arquivo.name;
            
            const btnProc = document.getElementById('btn-processar');
            if (btnProc) btnProc.disabled = false;
        }
    };

    const processarPDF = async () => {
        const arquivo = document.getElementById('input-pdf').files[0];
        if (!arquivo) {
            mostrarNotificacao('Selecione um arquivo PDF', 'erro');
            return;
        }

        mostrarCarregamento(true);
        limparNotificacoes();

        try {
            // Lê o PDF usando PDF.js
            const arrayBuffer = await arquivo.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let textoCompleto = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                textoCompleto += pageText + '\n';
            }

            // Processa o texto
            const resultado = extrairEmpenhos(textoCompleto);
            
            empenhosDados = resultado.empenhos || [];
            empenhosDuplicados.clear();

            // Verifica duplicados no localStorage
            for (const empenho of empenhosDados) {
                const duplicado = verificarDuplicadoLocal(empenho.numero);
                if (duplicado) {
                    empenhosDuplicados.set(empenho.numero, duplicado);
                }
            }

            exibirResultados(resultado);

            if (resultado.erros && resultado.erros.length > 0) {
                exibirErros(resultado.erros);
            }

            mostrarNotificacao(
                `${resultado.empenhos.length} empenho(s) extraído(s) com sucesso`,
                'sucesso'
            );

        } catch (erro) {
            console.error(erro);
            mostrarNotificacao(`Erro ao processar PDF: ${erro.message}`, 'erro');
        } finally {
            mostrarCarregamento(false);
        }
    };

    // ========================================================================
    // EXTRAÇÃO DE DADOS DO PDF
    // ========================================================================

    const extrairEmpenhos = (texto) => {
        const erros = [];
        const empenhos = [];

        // Padrão simples: procura por números que parecem ser empenhos
        const padraoEmpenho = /(\d{4}NE\d{6})/g;
        const matches = texto.match(padraoEmpenho);

        if (!matches || matches.length === 0) {
            erros.push({
                tipo: 'AVISO',
                mensagem: 'Nenhum empenho foi encontrado no PDF. Certifique-se que é um PDF SIGEF válido.'
            });
            return { empenhos: [], erros };
        }

        // Para cada empenho encontrado, extrai dados básicos
        const numerosUnicos = [...new Set(matches)];
        
        numerosUnicos.forEach((numero, idx) => {
            try {
                // Cria um empenho com dados mínimos
                const empenho = {
                    numero: numero,
                    data_referencia: extrairData(texto, numero) || '01/01/2026',
                    credor: {
                        cnpj: extrairCNPJ(texto, numero) || '00.000.000/0000-00',
                        razao_social: extrairRazaoSocial(texto, numero) || 'Não informado'
                    },
                    historico: [extrairHistorico(texto, numero) || 'Sem descrição'],
                    tem_contrato: texto.includes('Contrato'),
                    tem_emenda: texto.includes('Emenda'),
                    evento: 'Emissão de Empenho da Despesa'
                };

                empenhos.push(empenho);
            } catch (e) {
                erros.push({
                    tipo: 'ERRO',
                    empenho: numero,
                    mensagem: e.message
                });
            }
        });

        return { empenhos, erros };
    };

    const extrairData = (texto, numero) => {
        const regex = new RegExp(`${numero}[\\s\\S]{0,200}(\\d{2}/\\d{2}/\\d{4})`, 'i');
        const match = texto.match(regex);
        return match ? match[1] : null;
    };

    const extrairCNPJ = (texto, numero) => {
        const regex = new RegExp(`${numero}[\\s\\S]{0,500}(\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}|\\d{14})`, 'i');
        const match = texto.match(regex);
        if (match) {
            let cnpj = match[1].replace(/\D/g, '');
            return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
        }
        return null;
    };

    const extrairRazaoSocial = (texto, numero) => {
        const regex = new RegExp(`${numero}[\\s\\S]{0,200}([A-Z\\s]{10,100})`, 'i');
        const match = texto.match(regex);
        return match ? match[1].trim().substring(0, 50) : null;
    };

    const extrairHistorico = (texto, numero) => {
        const regex = new RegExp(`${numero}[\\s\\S]{0,300}(Histórico[\\s\\S]{0,100})`, 'i');
        const match = texto.match(regex);
        return match ? match[1].substring(0, 100) : null;
    };

    // ========================================================================
    // VERIFICAÇÃO DE DUPLICADOS (localStorage)
    // ========================================================================

    const verificarDuplicadoLocal = (numero) => {
        const empenhos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
        return empenhos.find(e => e.numero === numero);
    };

    // ========================================================================
    // EXIBIÇÃO DE RESULTADOS
    // ========================================================================

    const exibirResultados = (resultado) => {
        const container = document.getElementById('tabela-empenhos-container');
        if (!container) return;
        
        container.innerHTML = '';

        if (!resultado.empenhos || resultado.empenhos.length === 0) {
            container.innerHTML = '<p class="aviso">Nenhum empenho foi extraído</p>';
            return;
        }

        const html = `
            <div class="tabela-responsiva">
                <table class="tabela-empenhos">
                    <thead>
                        <tr>
                            <th>Nº Empenho</th>
                            <th>Data Ref.</th>
                            <th>CNPJ</th>
                            <th>Razão Social</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${resultado.empenhos.map((emp, idx) => criarLinhaTabela(emp, idx)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;

        resultado.empenhos.forEach((emp, idx) => {
            const btnEditar = document.getElementById(`btn-editar-${idx}`);
            const btnRemover = document.getElementById(`btn-remover-${idx}`);
            
            if (btnEditar) btnEditar.addEventListener('click', () => abrirModalEditar(emp, idx));
            if (btnRemover) btnRemover.addEventListener('click', () => removerEmpenho(idx));
        });
    };

    const criarLinhaTabela = (empenho, idx) => {
        const duplicado = empenhosDuplicados.get(empenho.numero);
        const statusClass = duplicado ? 'duplicado' : 'novo';
        const statusTexto = duplicado ? '⚠️ Duplicado' : '✓ Novo';

        return `
            <tr class="linha-${statusClass}" data-index="${idx}">
                <td>${empenho.numero}</td>
                <td>${empenho.data_referencia}</td>
                <td>${empenho.credor.cnpj}</td>
                <td>${empenho.credor.razao_social}</td>
                <td><span class="status ${statusClass}">${statusTexto}</span></td>
                <td>
                    <button class="btn-mini" id="btn-editar-${idx}" title="Editar">✎</button>
                    <button class="btn-mini" id="btn-remover-${idx}" title="Remover">✕</button>
                </td>
            </tr>
        `;
    };

    // ========================================================================
    // MODAL DE EDIÇÃO
    // ========================================================================

    const abrirModalEditar = (empenho, idx) => {
        const modal = document.getElementById('modal-editar-empenho');
        if (!modal) return;
        
        const elementos = {
            'edit-numero': empenho.numero,
            'edit-data': empenho.data_referencia,
            'edit-cnpj': empenho.credor.cnpj,
            'edit-razao': empenho.credor.razao_social,
            'edit-historico': empenho.historico.join('\n'),
            'edit-evento': empenho.evento
        };
        
        for (const [id, value] of Object.entries(elementos)) {
            const el = document.getElementById(id);
            if (el) el.value = value;
        }

        const btnSalvar = document.getElementById('btn-salvar-edicao');
        if (btnSalvar) {
            btnSalvar.onclick = () => {
                salvarEdicao(idx);
                fecharModal();
            };
        }

        modal.style.display = 'block';
    };

    const fecharModal = () => {
        const modal = document.getElementById('modal-editar-empenho');
        if (modal) modal.style.display = 'none';
    };

    const salvarEdicao = (idx) => {
        if (idx < empenhosDados.length) {
            const historico = document.getElementById('edit-historico')?.value || '';
            empenhosDados[idx] = {
                numero: document.getElementById('edit-numero')?.value || '',
                data_referencia: document.getElementById('edit-data')?.value || '',
                credor: {
                    cnpj: document.getElementById('edit-cnpj')?.value || '',
                    razao_social: document.getElementById('edit-razao')?.value || ''
                },
                historico: historico.split('\n'),
                tem_contrato: false,
                tem_emenda: false,
                evento: document.getElementById('edit-evento')?.value || ''
            };

            mostrarNotificacao('Empenho editado (não salvo ainda)', 'info');
            exibirResultados({ empenhos: empenhosDados });
        }
    };

    const removerEmpenho = (idx) => {
        if (confirm('Tem certeza que quer remover este empenho?')) {
            empenhosDados.splice(idx, 1);
            exibirResultados({ empenhos: empenhosDados });
            mostrarNotificacao('Empenho removido da listagem', 'info');
        }
    };

    // ========================================================================
    // SALVAR NO localStorage
    // ========================================================================

    const salvarTodos = async () => {
        if (empenhosDados.length === 0) {
            mostrarNotificacao('Nenhum empenho para salvar', 'aviso');
            return;
        }

        try {
            const empenhosSalvos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            
            for (const empenho of empenhosDados) {
                const indice = empenhosSalvos.findIndex(e => e.numero === empenho.numero);
                
                if (indice >= 0) {
                    // Atualiza existente
                    empenhosSalvos[indice] = empenho;
                } else {
                    // Adiciona novo
                    empenhosSalvos.push(empenho);
                }
            }
            
            localStorage.setItem('empenhos_salvos', JSON.stringify(empenhosSalvos));
            
            mostrarNotificacao('Todos os empenhos foram salvos com sucesso!', 'sucesso');
            limpar();
            await carregarEmpenhos();

        } catch (erro) {
            console.error(erro);
            mostrarNotificacao(`Erro ao salvar: ${erro.message}`, 'erro');
        }
    };

    // ========================================================================
    // CARREGAMENTO DE EMPENHOS SALVOS
    // ========================================================================

    const carregarEmpenhos = async () => {
        try {
            const empenhos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            exibirTabelaSalvos(empenhos);
        } catch (erro) {
            console.error('Erro ao carregar empenhos:', erro);
        }
    };

    const exibirTabelaSalvos = (empenhos) => {
        const container = document.getElementById('tabela-salvos-container');
        if (!container) return;
        
        container.innerHTML = '';

        if (empenhos.length === 0) {
            container.innerHTML = '<p class="aviso">Nenhum empenho cadastrado</p>';
            return;
        }

        const html = `
            <div class="tabela-responsiva">
                <table class="tabela-empenhos">
                    <thead>
                        <tr>
                            <th>Nº Empenho</th>
                            <th>Data</th>
                            <th>CNPJ</th>
                            <th>Razão Social</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${empenhos.map((emp) => `
                            <tr>
                                <td>${emp.numero}</td>
                                <td>${emp.data_referencia}</td>
                                <td>${emp.credor.cnpj}</td>
                                <td>${emp.credor.razao_social}</td>
                                <td>
                                    <button class="btn-mini" onclick="ModuloEmpenhos.deletarEmpenho('${emp.numero}')" title="Deletar">🗑</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    };

    // ========================================================================
    // UTILITÁRIOS
    // ========================================================================

    const exibirErros = (erros) => {
        const container = document.getElementById('lista-erros');
        if (!container) return;
        
        container.innerHTML = '';

        const html = erros.map(erro => `
            <div class="erro-item tipo-${erro.tipo.toLowerCase()}">
                <strong>${erro.tipo}${erro.empenho ? ` [${erro.empenho}]` : ''}:</strong>
                ${erro.mensagem}
            </div>
        `).join('');

        container.innerHTML = html;
        container.style.display = 'block';
    };

    const mostrarNotificacao = (mensagem, tipo = 'info') => {
        const container = document.getElementById('notificacoes');
        if (!container) return;
        
        const elemento = document.createElement('div');
        elemento.className = `notificacao ${tipo}`;
        elemento.textContent = mensagem;

        container.appendChild(elemento);

        setTimeout(() => {
            elemento.remove();
        }, 5000);
    };

    const limparNotificacoes = () => {
        const notif = document.getElementById('notificacoes');
        const erros = document.getElementById('lista-erros');
        
        if (notif) notif.innerHTML = '';
        if (erros) erros.style.display = 'none';
    };

    const mostrarCarregamento = (mostrar) => {
        const el = document.getElementById('carregando');
        if (el) el.style.display = mostrar ? 'flex' : 'none';
    };

    const limpar = () => {
        const inputPdf = document.getElementById('input-pdf');
        const nomeArq = document.getElementById('nome-arquivo');
        const tabelaEmpenhos = document.getElementById('tabela-empenhos-container');
        const btnProc = document.getElementById('btn-processar');
        
        if (inputPdf) inputPdf.value = '';
        if (nomeArq) nomeArq.textContent = 'Nenhum arquivo selecionado';
        if (tabelaEmpenhos) tabelaEmpenhos.innerHTML = '';
        if (btnProc) btnProc.disabled = true;
        
        empenhosDados = [];
        empenhosDuplicados.clear();
        limparNotificacoes();
    };

    const deletarEmpenho = (numero) => {
        if (!confirm('Tem certeza que quer deletar este empenho?')) {
            return;
        }

        try {
            const empenhos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            const filtrados = empenhos.filter(e => e.numero !== numero);
            localStorage.setItem('empenhos_salvos', JSON.stringify(filtrados));
            
            mostrarNotificacao('Empenho deletado com sucesso', 'sucesso');
            carregarEmpenhos();
        } catch (erro) {
            mostrarNotificacao(`Erro ao deletar: ${erro.message}`, 'erro');
        }
    };

    // ========================================================================
    // API PÚBLICA
    // ========================================================================

    return {
        init,
        deletarEmpenho
    };
})();

// Inicializa quando a página carrega
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(ModuloEmpenhos.init, 100);
    });
} else {
    setTimeout(ModuloEmpenhos.init, 100);
}
