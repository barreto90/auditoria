/**
 * Módulo de Empenhos - Versão GitHub v2
 * Corrigido: sem duplicatas, dados precisos, busca em FORNECEDORES
 */

const ModuloEmpenhos = (() => {
    let empenhosDados = [];
    let empenhosDuplicados = new Map();
    let empenhosDuplicatasInternas = new Set(); // Para evitar duplicatas no mesmo PDF

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
        empenhosDuplicatasInternas.clear(); // Reset para novo PDF

        try {
            const arrayBuffer = await arquivo.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let textoCompleto = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                textoCompleto += pageText + '\n';
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
    // EXTRAÇÃO DE DADOS - SEM DUPLICATAS
    // ========================================================================

    const extrairEmpenhos = (texto) => {
        const erros = [];
        const empenhos = [];
        const numerosProcessados = new Set(); // Evita duplicatas

        // Padrão: número com 4 dígitos + NE + 6 dígitos
        const padraoNumero = /(\d{4}NE\d{6})/g;
        const matches = [...texto.matchAll(padraoNumero)];

        if (matches.length === 0) {
            erros.push({
                tipo: 'AVISO',
                mensagem: 'Nenhum empenho encontrado no PDF.'
            });
            return { empenhos: [], erros };
        }

        matches.forEach((match) => {
            try {
                const numero = match[0];

                // IMPORTANTE: Não processa se já vimos este número neste PDF
                if (numerosProcessados.has(numero)) {
                    return; // Pula duplicata
                }
                numerosProcessados.add(numero);

                const posicao = match.index;
                
                // Extrai bloco ao redor para ter contexto completo
                const inicio = Math.max(0, posicao - 500);
                const fim = Math.min(texto.length, posicao + 6000);
                const blocoEmpenho = texto.substring(inicio, fim);

                const empenho = {
                    numero: numero,
                    data_referencia: extrairDataReferencia(blocoEmpenho),
                    credor: extrairCredor(blocoEmpenho),
                    historico: extrairHistorico(texto, posicao), // Busca no texto inteiro
                    tem_contrato: extrairTemContrato(blocoEmpenho),
                    tem_emenda: extrairTemEmenda(blocoEmpenho),
                    evento: 'Emissão de Empenho da Despesa'
                };

                empenhos.push(empenho);
            } catch (e) {
                console.error('Erro ao processar empenho:', e);
                erros.push({
                    tipo: 'ERRO',
                    empenho: match[0],
                    mensagem: e.message
                });
            }
        });

        return { empenhos, erros };
    };

    // ========================================================================
    // EXTRAÇÃO DE CAMPOS
    // ========================================================================

    const extrairDataReferencia = (texto) => {
        const regex = /Data\s+Referência\s+(\d{2}\/\d{2}\/\d{4})/i;
        const match = texto.match(regex);
        return match ? match[1] : '01/01/2026';
    };

    const extrairCredor = (texto) => {
        let cnpj = '';
        let razaoSocial = '';

        // Padrão: "Credor" seguido de CNPJ e razão social
        const regexCredor = /Credor\s+([0-9.\/\-]+)\s+([A-Z\s\-\.]+?)(?=\n|Endereço|Gestão)/i;
        const matchCredor = texto.match(regexCredor);

        if (matchCredor) {
            cnpj = matchCredor[1].replace(/\D/g, '');
            cnpj = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
            
            // Tenta buscar no banco FORNECEDORES
            if (window.FORNECEDORES && window.FORNECEDORES[cnpj]) {
                razaoSocial = window.FORNECEDORES[cnpj];
            } else {
                // Se não estiver no banco, deixa vazio
                razaoSocial = '';
            }
        } else {
            // Tenta encontrar CNPJ sozinho
            const regexCNPJ = /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/;
            const matchCNPJ = texto.match(regexCNPJ);
            if (matchCNPJ) {
                cnpj = matchCNPJ[1] + '.' + matchCNPJ[2] + '.' + matchCNPJ[3] + '/' + matchCNPJ[4] + '-' + matchCNPJ[5];
                
                if (window.FORNECEDORES && window.FORNECEDORES[cnpj]) {
                    razaoSocial = window.FORNECEDORES[cnpj];
                }
            }
        }

        return {
            cnpj: cnpj || '00.000.000/0000-00',
            razao_social: razaoSocial
        };
    };

    const extrairHistorico = (textoCompleto, posicaoNumero) => {
        // Procura por "HISTÓRICO" em negrito (letra maiúscula e depois quebra de linha)
        // Em seguida pega até encontrar a linha horizontal (sequência de dashes)
        
        const regex = /HISTÓRICO\s*\n([^]*?)(?=\-{10,}|Data\s+Referência|$)/i;
        const match = textoCompleto.substring(posicaoNumero, posicaoNumero + 8000).match(regex);

        if (match && match[1]) {
            const texto = match[1]
                .trim()
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 3)
                .slice(0, 5) // Máximo 5 linhas
                .join('\n');
            
            return texto.length > 5 ? [texto] : ['Sem descrição'];
        }

        return ['Sem descrição'];
    };

    const extrairTemContrato = (texto) => {
        // Procura por "Tipo Contrato" ou "Contrato"
        // Se tiver algo escrito embaixo = true, senão = false
        
        const regex = /(?:Tipo\s+)?Contrato\s*\n\s*([^\n]+)/i;
        const match = texto.match(regex);

        if (match && match[1]) {
            const valor = match[1].trim();
            // Se tem algo e não é vazio ou "Não"
            return valor.length > 0 && !valor.toLowerCase().includes('não') && valor !== '—' && valor !== 'Não';
        }

        return false;
    };

    const extrairTemEmenda = (texto) => {
        // Procura por "Emenda Parlamentar"
        // Se tiver algo escrito embaixo = true, senão = false
        
        const regex = /Emenda\s+Parlamentar\s*\n\s*([^\n]+)/i;
        const match = texto.match(regex);

        if (match && match[1]) {
            const valor = match[1].trim();
            return valor.length > 0 && !valor.toLowerCase().includes('não') && valor !== '—' && valor !== 'Não';
        }

        return false;
    };

    const verificarDuplicadoLocal = (numero) => {
        const empenhos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
        return empenhos.find(e => e.numero === numero);
    };

    // ========================================================================
    // EXIBIÇÃO
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
                <td>${empenho.credor.razao_social || '(sem nome)'}</td>
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

    const abrirModalEditar = (empenho, idx) => {
        const modal = document.getElementById('modal-editar-empenho');
        if (!modal) return;
        
        const elementos = {
            'edit-numero': empenho.numero,
            'edit-data': empenho.data_referencia,
            'edit-cnpj': empenho.credor.cnpj,
            'edit-razao': empenho.credor.razao_social || '',
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

            mostrarNotificacao('Empenho editado', 'info');
            exibirResultados({ empenhos: empenhosDados });
        }
    };

    const removerEmpenho = (idx) => {
        if (confirm('Remover este empenho?')) {
            empenhosDados.splice(idx, 1);
            exibirResultados({ empenhos: empenhosDados });
            mostrarNotificacao('Empenho removido', 'info');
        }
    };

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
            
            mostrarNotificacao('Empenhos salvos com sucesso!', 'sucesso');
            limpar();
            await carregarEmpenhos();

        } catch (erro) {
            mostrarNotificacao(`Erro: ${erro.message}`, 'erro');
        }
    };

    const carregarEmpenhos = async () => {
        try {
            const empenhos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            exibirTabelaSalvos(empenhos);
        } catch (erro) {
            console.error('Erro ao carregar:', erro);
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
                                <td>${emp.credor.razao_social || '(sem nome)'}</td>
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

    const exibirErros = (erros) => {
        const container = document.getElementById('lista-erros');
        if (!container) return;
        
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
        setTimeout(() => elemento.remove(), 5000);
    };

    const limparNotificacoes = () => {
        const notif = document.getElementById('notificacoes');
        if (notif) notif.innerHTML = '';
        const erros = document.getElementById('lista-erros');
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
        if (!confirm('Deletar este empenho?')) return;

        try {
            const empenhos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            const filtrados = empenhos.filter(e => e.numero !== numero);
            localStorage.setItem('empenhos_salvos', JSON.stringify(filtrados));
            
            mostrarNotificacao('Empenho deletado', 'sucesso');
            carregarEmpenhos();
        } catch (erro) {
            mostrarNotificacao(`Erro: ${erro.message}`, 'erro');
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
