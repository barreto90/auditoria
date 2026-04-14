/**
 * Módulo de Empenhos - Notas Fiscais Beta
 * Extrai dados de PDFs SIGEF e gerencia registros
 */

const ModuloEmpenhos = (() => {
    const API_URL = 'http://localhost:8000/api';
    let empenhosDados = [];
    let empenhosDuplicados = new Map();

    // ========================================================================
    // INICIALIZAÇÃO
    // ========================================================================

    const init = () => {
        console.log('ModuloEmpenhos inicializando...');
        
        // Event listeners - verifica se elementos existem
        const inputPdf = document.getElementById('input-pdf');
        const btnProcessar = document.getElementById('btn-processar');
        const btnSalvarTodos = document.getElementById('btn-salvar-todos');
        const btnLimpar = document.getElementById('btn-limpar');
        
        console.log('Elementos encontrados:', {
            inputPdf: !!inputPdf,
            btnProcessar: !!btnProcessar,
            btnSalvarTodos: !!btnSalvarTodos,
            btnLimpar: !!btnLimpar
        });
        
        if (inputPdf) inputPdf.addEventListener('change', handleFileSelect);
        if (btnProcessar) btnProcessar.addEventListener('click', processarPDF);
        if (btnSalvarTodos) btnSalvarTodos.addEventListener('click', salvarTodos);
        if (btnLimpar) btnLimpar.addEventListener('click', limpar);

        // Carrega empenhos salvos
        carregarEmpenhos();
        
        console.log('ModuloEmpenhos inicializado com sucesso!');
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

        const formData = new FormData();
        formData.append('file', arquivo);

        mostrarCarregamento(true);
        limparNotificacoes();

        try {
            const response = await fetch(`${API_URL}/processar-pdf`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Erro HTTP ${response.status}`);
            }

            const resultado = await response.json();

            // Processa empenhos extraídos
            empenhosDados = resultado.empenhos || [];
            empenhosDuplicados.clear();

            // Verifica duplicados
            for (const empenho of empenhosDados) {
                const duplicado = await verificarDuplicado(empenho.numero);
                if (duplicado) {
                    empenhosDuplicados.set(empenho.numero, duplicado);
                }
            }

            // Exibe resultados
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
    // VERIFICAÇÃO DE DUPLICADOS
    // ========================================================================

    const verificarDuplicado = async (numero) => {
        try {
            const response = await fetch(`${API_URL}/empenhos`);
            const dados = await response.json();

            const encontrado = dados.empenhos.find(e => e.numero === numero);
            return encontrado || null;
        } catch (erro) {
            console.error('Erro ao verificar duplicado:', erro);
            return null;
        }
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
                            <th>Contrato</th>
                            <th>Emenda</th>
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

        // Event listeners para cada linha
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
                <td>${formatarCNPJ(empenho.credor.cnpj)}</td>
                <td>${empenho.credor.razao_social}</td>
                <td>${empenho.tem_contrato ? '✓' : '—'}</td>
                <td>${empenho.tem_emenda ? '✓' : '—'}</td>
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
        
        // Preenche campos
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
        
        const checkContrato = document.getElementById('edit-contrato');
        const checkEmenda = document.getElementById('edit-emenda');
        if (checkContrato) checkContrato.checked = empenho.tem_contrato;
        if (checkEmenda) checkEmenda.checked = empenho.tem_emenda;

        // Botão de salvar
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
                tem_contrato: document.getElementById('edit-contrato')?.checked || false,
                tem_emenda: document.getElementById('edit-emenda')?.checked || false,
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
    // SALVAR NO BANCO
    // ========================================================================

    const salvarTodos = async () => {
        if (empenhosDados.length === 0) {
            mostrarNotificacao('Nenhum empenho para salvar', 'aviso');
            return;
        }

        mostrarCarregamento(true);

        try {
            for (const empenho of empenhosDados) {
                const duplicado = empenhosDuplicados.get(empenho.numero);

                if (duplicado) {
                    const resultado = await perguntarDuplicado(empenho, duplicado);
                    if (resultado === 'atualizar') {
                        empenho.forcar_atualizacao = true;
                    } else if (resultado === 'ignorar') {
                        continue;
                    }
                }

                await salvarEmpenho(empenho);
            }

            mostrarNotificacao('Todos os empenhos foram salvos com sucesso!', 'sucesso');
            limpar();
            await carregarEmpenhos();

        } catch (erro) {
            console.error(erro);
            mostrarNotificacao(`Erro ao salvar: ${erro.message}`, 'erro');
        } finally {
            mostrarCarregamento(false);
        }
    };

    const salvarEmpenho = async (empenho) => {
        const response = await fetch(`${API_URL}/salvar-empenhos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ empenhos: [empenho] })
        });

        if (!response.ok) {
            throw new Error(`Erro ao salvar empenho ${empenho.numero}`);
        }

        return response.json();
    };

    const perguntarDuplicado = (novo, existente) => {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-duplicado');
            if (!modal) {
                resolve('ignorar');
                return;
            }
            
            const numEl = document.getElementById('dup-numero');
            const novaDataEl = document.getElementById('dup-novo-data');
            const existeDataEl = document.getElementById('dup-existe-data');
            
            if (numEl) numEl.textContent = novo.numero;
            if (novaDataEl) novaDataEl.textContent = novo.data_referencia;
            if (existeDataEl) existeDataEl.textContent = existente.data_referencia;

            const btnAtualizar = document.getElementById('btn-atualizar');
            const btnIgnorar = document.getElementById('btn-ignorar');
            
            if (btnAtualizar) {
                btnAtualizar.onclick = () => {
                    modal.style.display = 'none';
                    resolve('atualizar');
                };
            }
            
            if (btnIgnorar) {
                btnIgnorar.onclick = () => {
                    modal.style.display = 'none';
                    resolve('ignorar');
                };
            }

            modal.style.display = 'block';
        });
    };

    // ========================================================================
    // CARREGAMENTO DE EMPENHOS SALVOS
    // ========================================================================

    const carregarEmpenhos = async () => {
        try {
            const response = await fetch(`${API_URL}/empenhos`);
            const dados = await response.json();

            exibirTabelaSalvos(dados.empenhos || []);
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
                            <th>Contrato</th>
                            <th>Emenda</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${empenhos.map((emp) => `
                            <tr>
                                <td>${emp.numero}</td>
                                <td>${emp.data_referencia}</td>
                                <td>${formatarCNPJ(emp.cnpj)}</td>
                                <td>${emp.razao_social}</td>
                                <td>${emp.tem_contrato ? '✓' : '—'}</td>
                                <td>${emp.tem_emenda ? '✓' : '—'}</td>
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

    const formatarCNPJ = (cnpj) => {
        if (!cnpj) return '';
        const limpo = cnpj.replace(/\D/g, '');
        return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    };

    const deletarEmpenho = async (numero) => {
        if (!confirm('Tem certeza que quer deletar este empenho?')) {
            return;
        }

        try {
            const response = await fetch(`${API_URL}/empenhos/${numero}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                mostrarNotificacao('Empenho deletado com sucesso', 'sucesso');
                await carregarEmpenhos();
            }
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

// Inicializa quando a página carrega - com verificação de readyState
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(ModuloEmpenhos.init, 100);
    });
} else {
    setTimeout(ModuloEmpenhos.init, 100);
}
