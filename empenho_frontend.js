/**
 * Módulo de Empenhos - Versão GitHub (sem backend)
 * Extrai dados de PDFs SIGEF com padrão correto
 */

const ModuloEmpenhos = (() => {
    let empenhosDados = [];
    let empenhosDuplicados = new Map();

    const init = () => {
        console.log('ModuloEmpenhos inicializando...');
        
        const inputPdf = document.getElementById('input-pdf');
        const btnProcessar = document.getElementById('btn-processar');
        const btnSalvarTodos = document.getElementById('btn-salvar-todos');
        const btnLimpar = document.getElementById('btn-limpar');
        
        if (inputPdf) inputPdf.addEventListener('change', handleFileSelect);
        if (btnProcessar) btnProcessar.addEventListener('click', processarPDF);
        if (btnSalvarTodos) btnSalvarTodos.addEventListener('click', salvarTodos);
        if (btnLimpar) btnLimpar.addEventListener('click', limpar);

        carregarEmpenhos();
        console.log('ModuloEmpenhos inicializado!');
    };

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
            const arrayBuffer = await arquivo.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let textoCompleto = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                textoCompleto += '\n--- PÁGINA ' + i + ' ---\n' + pageText;
            }

            const resultado = extrairEmpenhos(textoCompleto);
            
            empenhosDados = resultado.empenhos || [];
            empenhosDuplicados.clear();

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
    // EXTRAÇÃO OTIMIZADA BASEADA NO PADRÃO SIGEF
    // ========================================================================

    const extrairEmpenhos = (texto) => {
        const erros = [];
        const empenhos = [];

        // Padrão: "Número" seguido do número de empenho (XXXXNE000000)
        const padraoNumero = /Número\s+(\d{4}NE\d{6})/g;
        const matches = [...texto.matchAll(padraoNumero)];

        if (matches.length === 0) {
            erros.push({
                tipo: 'AVISO',
                mensagem: 'Nenhum empenho encontrado. Certifique-se que é um PDF SIGEF válido.'
            });
            return { empenhos: [], erros };
        }

        matches.forEach((match, idx) => {
            try {
                const numero = match[1];
                const posicao = match.index;
                
                // Extrai um trecho GRANDE (8000 chars) para ter todo o contexto
                const inicio = Math.max(0, posicao - 1000);
                const fim = Math.min(texto.length, posicao + 7000);
                const trecho = texto.substring(inicio, fim);

                const empenho = {
                    numero: numero,
                    data_referencia: extrairDataReferencia(trecho),
                    credor: extrairCredor(trecho),
                    historico: extrairHistorico(trecho),
                    tem_contrato: extrairTemContrato(trecho),
                    tem_emenda: extrairTemEmenda(trecho),
                    evento: extrairEvento(trecho)
                };

                empenhos.push(empenho);
            } catch (e) {
                erros.push({
                    tipo: 'ERRO',
                    empenho: match[1],
                    mensagem: e.message
                });
            }
        });

        return { empenhos, erros };
    };

    // ========================================================================
    // EXTRAÇÃO DE CAMPOS INDIVIDUAIS
    // ========================================================================

    const extrairDataReferencia = (texto) => {
        // "Data Referência" seguida de data DD/MM/YYYY
        const regex = /Data\s+Referência\s+(\d{2}\/\d{2}\/\d{4})/i;
        const match = texto.match(regex);
        return match ? match[1] : '01/01/2026';
    };

    const extrairCredor = (texto) => {
        let cnpj = '';
        let razaoSocial = 'Não informado';

        // Padrão: "Credor" seguido de CNPJ e razão social na linha seguinte
        const regexCredor = /Credor\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})\s*-?\s*([A-Z\s\-\.]+?)(?=\n|Endereço|$)/i;
        const matchCredor = texto.match(regexCredor);

        if (matchCredor) {
            cnpj = matchCredor[1].replace(/\D/g, '');
            cnpj = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
            razaoSocial = matchCredor[2].trim().substring(0, 100);
        } else {
            // Tenta encontrar CNPJ solto
            const regexCNPJ = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})/;
            const matchCNPJ = texto.match(regexCNPJ);
            if (matchCNPJ) {
                cnpj = matchCNPJ[1].replace(/\D/g, '');
                cnpj = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
            }

            // Tenta encontrar razão social após CNPJ
            const regexRazaoAposCNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s+([A-Z\s\-\.]{10,150}?)(?=\n|AVENIDA|Endereço|$)/i;
            const matchRazao = texto.match(regexRazaoAposCNPJ);
            if (matchRazao) {
                razaoSocial = matchRazao[1].trim().substring(0, 100);
            }
        }

        return {
            cnpj: cnpj || '00.000.000/0000-00',
            razao_social: razaoSocial
        };
    };

    const extrairHistorico = (texto) => {
        const historicos = [];

        // "Histórico" seguido do texto até próxima seção
        const regexHistorico = /Histórico\s*\n\s*([^\n]+(?:\n(?!Unidade|Gestão|Complemento|Credor).*)*)/i;
        const matchHistorico = texto.match(regexHistorico);

        if (matchHistorico) {
            const hist = matchHistorico[1].trim();
            // Divide em linhas e remove vazias
            const linhas = hist.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 5 && !l.includes('http'))
                .slice(0, 3); // Máximo 3 linhas
            
            historicos.push(...linhas);
        }

        return historicos.length > 0 ? historicos : ['Sem descrição'];
    };

    const extrairTemContrato = (texto) => {
        // Procura por "Contrato" seguido de número (padrão: 2024CT011115)
        const regex = /Contrato\s+(\d{4}CT\d{6}|[A-Z0-9\-\/]+)/i;
        const match = texto.match(regex);

        if (match) {
            const contrato = match[1].trim();
            return contrato && contrato !== 'Não' && contrato.length > 2;
        }

        return false;
    };

    const extrairTemEmenda = (texto) => {
        // Procura por "Emenda Parlamentar" ou "Emenda"
        const regex = /Emenda\s+Parlamentar\s+([^\n]+)/i;
        const match = texto.match(regex);

        if (match) {
            const emenda = match[1].trim();
            // Se tem valor e não é "Não" ou vazio
            return emenda.length > 2 && !emenda.toLowerCase().includes('não');
        }

        // Fallback: procura por "Emenda:" (pode ter SIM/NÃO)
        const regexSimples = /Emenda\s*[:=]\s*(Sim|SIM|Não|NÃO|[A-Z0-9]+)/i;
        const matchSimples = texto.match(regexSimples);

        if (matchSimples) {
            return !matchSimples[1].toLowerCase().includes('não');
        }

        return false;
    };

    const extrairEvento = (texto) => {
        // Procura por "Evento" seguido da descrição
        const regex = /Evento\s+([A-Z0-9\-\s]+?)(?=\n|Credor|$)/i;
        const match = texto.match(regex);

        if (match) {
            const evento = match[1].trim().substring(0, 100);
            if (evento.length > 5) {
                return evento;
            }
        }

        // Padrão padrão do SIGEF
        return 'Emissão de Empenho da Despesa';
    };

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
        
        const elementos = {
            'edit-numero': empenho.numero,
            'edit-data': empenho.data_referencia,
            'edit-cnpj': empenho.credor.cnpj,
            'edit-razao': empenho.credor.razao_social,
            'edit-historico': Array.isArray(empenho.historico) ? empenho.historico.join('\n') : empenho.historico || '',
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
                historico: historico.split('\n').filter(h => h.trim()),
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
                    empenhosSalvos[indice] = empenho;
                } else {
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
                                <td>${emp.credor.cnpj}</td>
                                <td>${emp.credor.razao_social}</td>
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

    return {
        init,
        deletarEmpenho
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(ModuloEmpenhos.init, 100);
    });
} else {
    setTimeout(ModuloEmpenhos.init, 100);
}
