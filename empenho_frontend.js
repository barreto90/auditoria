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
        // Event listeners
        document.getElementById('btn-upload-pdf').addEventListener('click', handleUploadClick);
        document.getElementById('input-pdf').addEventListener('change', handleFileSelect);
        document.getElementById('btn-processar').addEventListener('click', processarPDF);
        document.getElementById('btn-salvar-todos').addEventListener('click', salvarTodos);
        document.getElementById('btn-limpar').addEventListener('click', limpar);

        // Carrega empenhos salvos
        carregarEmpenhos();
    };

    // ========================================================================
    // UPLOAD E PROCESSAMENTO
    // ========================================================================

    const handleUploadClick = () => {
        document.getElementById('input-pdf').click();
    };

    const handleFileSelect = (e) => {
        const arquivo = e.target.files[0];
        if (arquivo) {
            document.getElementById('nome-arquivo').textContent = arquivo.name;
            document.getElementById('btn-processar').disabled = false;
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
            document.getElementById(`btn-editar-${idx}`).addEventListener('click', () => abrirModalEditar(emp, idx));
            document.getElementById(`btn-remover-${idx}`).addEventListener('click', () => removerEmpenho(idx));
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
        
        // Preenche campos
        document.getElementById('edit-numero').value = empenho.numero;
        document.getElementById('edit-data').value = empenho.data_referencia;
        document.getElementById('edit-cnpj').value = empenho.credor.cnpj;
        document.getElementById('edit-razao').value = empenho.credor.razao_social;
        document.getElementById('edit-historico').value = empenho.historico.join('\n');
        document.getElementById('edit-contrato').checked = empenho.tem_contrato;
        document.getElementById('edit-emenda').checked = empenho.tem_emenda;
        document.getElementById('edit-evento').value = empenho.evento;

        // Botão de salvar
        document.getElementById('btn-salvar-edicao').onclick = () => {
            salvarEdicao(idx);
            fecharModal();
        };

        modal.style.display = 'block';
    };

    const fecharModal = () => {
        document.getElementById('modal-editar-empenho').style.display = 'none';
    };

    const salvarEdicao = (idx) => {
        if (idx < empenhosDados.length) {
            empenhosDados[idx] = {
                numero: document.getElementById('edit-numero').value,
                data_referencia: document.getElementById('edit-data').value,
                credor: {
                    cnpj: document.getElementById('edit-cnpj').value,
                    razao_social: document.getElementById('edit-razao').value
                },
                historico: document.getElementById('edit-historico').value.split('\n'),
                tem_contrato: document.getElementById('edit-contrato').checked,
                tem_emenda: document.getElementById('edit-emenda').checked,
                evento: document.getElementById('edit-evento').value
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
            // Processa cada empenho
            for (const empenho of empenhosDados) {
                const duplicado = empenhosDuplicados.get(empenho.numero);

                if (duplicado) {
                    // Pergunta ao usuário
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
            
            document.getElementById('dup-numero').textContent = novo.numero;
            document.getElementById('dup-novo-data').textContent = novo.data_referencia;
            document.getElementById('dup-existe-data').textContent = existente.data_referencia;

            document.getElementById('btn-atualizar').onclick = () => {
                modal.style.display = 'none';
                resolve('atualizar');
            };

            document.getElementById('btn-ignorar').onclick = () => {
                modal.style.display = 'none';
                resolve('ignorar');
            };

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
        const elemento = document.createElement('div');
        elemento.className = `notificacao ${tipo}`;
        elemento.textContent = mensagem;

        container.appendChild(elemento);

        setTimeout(() => {
            elemento.remove();
        }, 5000);
    };

    const limparNotificacoes = () => {
        document.getElementById('notificacoes').innerHTML = '';
        document.getElementById('lista-erros').style.display = 'none';
    };

    const mostrarCarregamento = (mostrar) => {
        document.getElementById('carregando').style.display = mostrar ? 'flex' : 'none';
    };

    const limpar = () => {
        document.getElementById('input-pdf').value = '';
        document.getElementById('nome-arquivo').textContent = 'Nenhum arquivo selecionado';
        document.getElementById('tabela-empenhos-container').innerHTML = '';
        document.getElementById('btn-processar').disabled = true;
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

// Inicializa quando a página carrega
document.addEventListener('DOMContentLoaded', ModuloEmpenhos.init);
