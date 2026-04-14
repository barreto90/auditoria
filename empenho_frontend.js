/**
 * Módulo de Empenhos - Versão FINAL
 * Extração simplificada e correta
 */

const ModuloEmpenhos = (() => {
    let empenhosDados = [];
    let empenhosDuplicados = new Map();
    let numerosProcessados = new Set();

    const init = () => {
        const inputPdf = document.getElementById('input-pdf');
        const btnProcessar = document.getElementById('btn-processar');
        const btnSalvarTodos = document.getElementById('btn-salvar-todos');
        const btnLimpar = document.getElementById('btn-limpar');
        
        if (inputPdf) inputPdf.addEventListener('change', handleFileSelect);
        if (btnProcessar) btnProcessar.addEventListener('click', processarPDF);
        if (btnSalvarTodos) btnSalvarTodos.addEventListener('click', salvarTodos);
        if (btnLimpar) btnLimpar.addEventListener('click', limpar);

        carregarEmpenhos();
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
            mostrarNotificacao('Selecione um PDF', 'erro');
            return;
        }

        mostrarCarregamento(true);
        numerosProcessados.clear();

        try {
            const arrayBuffer = await arquivo.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let textoCompleto = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                textoCompleto += textContent.items.map(item => item.str).join(' ') + '\n';
            }

            const resultado = extrairEmpenhos(textoCompleto);
            empenhosDados = resultado.empenhos || [];
            empenhosDuplicados.clear();

            for (const empenho of empenhosDados) {
                const dup = verificarDuplicadoLocal(empenho.numero);
                if (dup) empenhosDuplicados.set(empenho.numero, dup);
            }

            exibirResultados(resultado);
            if (resultado.erros.length > 0) exibirErros(resultado.erros);
            
            mostrarNotificacao(`${resultado.empenhos.length} empenho(s) extraído(s)`, 'sucesso');

        } catch (erro) {
            mostrarNotificacao(`Erro: ${erro.message}`, 'erro');
        } finally {
            mostrarCarregamento(false);
        }
    };

    // ========================================================================
    // EXTRAÇÃO - VERSÃO SIMPLIFICADA
    // ========================================================================

    const extrairEmpenhos = (texto) => {
        const erros = [];
        const empenhos = [];

        // Divide por empenhos: procura pelo padrão de número
        const padraoNumero = /(\d{4}NE\d{6})/g;
        let match;
        
        while ((match = padraoNumero.exec(texto)) !== null) {
            const numero = match[0];
            
            // Evita duplicatas
            if (numerosProcessados.has(numero)) continue;
            numerosProcessados.add(numero);

            try {
                const posicao = match.index;
                const bloco = texto.substring(posicao - 1000, posicao + 8000);

                const empenho = {
                    numero: numero,
                    data_referencia: extrairData(bloco),
                    credor: extrairCredor(bloco),
                    historico: [extrairHistorico(bloco)],
                    tem_contrato: extrairContrato(bloco),
                    tem_emenda: false, // Ignorando por enquanto
                    evento: 'Emissão de Empenho da Despesa'
                };

                empenhos.push(empenho);
            } catch (e) {
                erros.push({ tipo: 'ERRO', empenho: numero, mensagem: e.message });
            }
        }

        if (empenhos.length === 0) {
            erros.push({ tipo: 'AVISO', mensagem: 'Nenhum empenho encontrado' });
        }

        return { empenhos, erros };
    };

    // ========================================================================
    // EXTRAÇÃO DE CAMPOS - SIMPLES E DIRETO
    // ========================================================================

    const extrairData = (bloco) => {
        const match = bloco.match(/Data\s+Referência\s+(\d{2}\/\d{2}\/\d{4})/i);
        return match ? match[1] : '01/01/2026';
    };

    const extrairCredor = (bloco) => {
        // Procura por "Credor" seguido de CNPJ e nome
        const match = bloco.match(/Credor\s+([0-9]{2}\.?[0-9]{3}\.?[0-9]{3}\/?\d{4}\-?[0-9]{2})\s+([A-Z\s\-\.]+?)(?=\n|Endereço)/i);
        
        let cnpj = '';
        let razaoSocial = '';

        if (match) {
            cnpj = match[1].replace(/\D/g, '');
            cnpj = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
            
            // Busca no banco FORNECEDORES
            if (window.FORNECEDORES && window.FORNECEDORES[cnpj]) {
                razaoSocial = window.FORNECEDORES[cnpj];
            }
        }

        return {
            cnpj: cnpj || '00.000.000/0000-00',
            razao_social: razaoSocial
        };
    };

    const extrairHistorico = (bloco) => {
        // Procura "Histórico" e pega texto até "Entrega"
        const match = bloco.match(/Histórico\s*\n([^]*?)(?=\n(?:Entrega|Data\s+Prazo|Classificação))/i);
        
        if (match && match[1]) {
            return match[1]
                .trim()
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 3)
                .join(' ')
                .substring(0, 200);
        }
        
        return 'Sem descrição';
    };

    const extrairContrato = (bloco) => {
        // Procura por "Contrato" seguido de número
        // Padrão: YYYYCTXXXXXX
        const match = bloco.match(/Contrato\s+([0-9]{4}CT[0-9]{6})/i);
        return !!match;
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
            container.innerHTML = '<p class="aviso">Nenhum empenho extraído</p>';
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
                            <th>Histórico</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${resultado.empenhos.map((emp, idx) => `
                            <tr>
                                <td>${emp.numero}</td>
                                <td>${emp.data_referencia}</td>
                                <td>${emp.credor.cnpj}</td>
                                <td>${emp.credor.razao_social || '(sem nome)'}</td>
                                <td>${emp.tem_contrato ? '✓' : '—'}</td>
                                <td title="${emp.historico[0]}">${emp.historico[0].substring(0, 20)}...</td>
                                <td><span class="status ${empenhosDuplicados.get(emp.numero) ? 'duplicado' : 'novo'}">${empenhosDuplicados.get(emp.numero) ? '⚠️ Dup' : '✓ Novo'}</span></td>
                                <td>
                                    <button class="btn-mini" onclick="ModuloEmpenhos.abrirModal(${idx})" title="Editar">✎</button>
                                    <button class="btn-mini" onclick="ModuloEmpenhos.remover(${idx})" title="Remover">✕</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    };

    const abrirModal = (idx) => {
        const modal = document.getElementById('modal-editar-empenho');
        if (!modal || idx >= empenhosDados.length) return;

        const emp = empenhosDados[idx];
        
        document.getElementById('edit-numero').value = emp.numero;
        document.getElementById('edit-data').value = emp.data_referencia;
        document.getElementById('edit-cnpj').value = emp.credor.cnpj;
        document.getElementById('edit-razao').value = emp.credor.razao_social || '';
        document.getElementById('edit-historico').value = emp.historico[0];
        document.getElementById('edit-evento').value = emp.evento;
        document.getElementById('edit-contrato').checked = emp.tem_contrato;

        document.getElementById('btn-salvar-edicao').onclick = () => salvarModal(idx);
        
        modal.style.display = 'block';
    };

    const salvarModal = (idx) => {
        if (idx < empenhosDados.length) {
            empenhosDados[idx] = {
                numero: document.getElementById('edit-numero').value,
                data_referencia: document.getElementById('edit-data').value,
                credor: {
                    cnpj: document.getElementById('edit-cnpj').value,
                    razao_social: document.getElementById('edit-razao').value
                },
                historico: [document.getElementById('edit-historico').value],
                tem_contrato: document.getElementById('edit-contrato').checked,
                tem_emenda: false,
                evento: document.getElementById('edit-evento').value
            };
            
            document.getElementById('modal-editar-empenho').style.display = 'none';
            exibirResultados({ empenhos: empenhosDados, erros: [] });
            mostrarNotificacao('Empenho editado', 'info');
        }
    };

    const remover = (idx) => {
        if (confirm('Remover este empenho?')) {
            empenhosDados.splice(idx, 1);
            exibirResultados({ empenhos: empenhosDados, erros: [] });
        }
    };

    const salvarTodos = async () => {
        if (empenhosDados.length === 0) {
            mostrarNotificacao('Nenhum empenho para salvar', 'aviso');
            return;
        }

        try {
            const salvos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            
            for (const emp of empenhosDados) {
                const idx = salvos.findIndex(e => e.numero === emp.numero);
                if (idx >= 0) {
                    salvos[idx] = emp;
                } else {
                    salvos.push(emp);
                }
            }
            
            localStorage.setItem('empenhos_salvos', JSON.stringify(salvos));
            mostrarNotificacao('Salvos com sucesso!', 'sucesso');
            limpar();
            carregarEmpenhos();

        } catch (erro) {
            mostrarNotificacao(`Erro: ${erro.message}`, 'erro');
        }
    };

    const carregarEmpenhos = async () => {
        try {
            const empenhos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            exibirTabelaSalvos(empenhos);
        } catch (e) {}
    };

    const exibirTabelaSalvos = (empenhos) => {
        const container = document.getElementById('tabela-salvos-container');
        if (!container) return;
        
        container.innerHTML = '';

        if (empenhos.length === 0) {
            container.innerHTML = '<p class="aviso">Nenhum cadastrado</p>';
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
                                <td>
                                    <button class="btn-mini" onclick="ModuloEmpenhos.deletar('${emp.numero}')" title="Deletar">🗑</button>
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
        
        const html = erros.map(e => `
            <div class="erro-item tipo-${e.tipo.toLowerCase()}">
                <strong>${e.tipo}${e.empenho ? ` [${e.empenho}]` : ''}:</strong> ${e.mensagem}
            </div>
        `).join('');

        container.innerHTML = html;
        container.style.display = 'block';
    };

    const mostrarNotificacao = (msg, tipo = 'info') => {
        const container = document.getElementById('notificacoes');
        if (!container) return;
        
        const el = document.createElement('div');
        el.className = `notificacao ${tipo}`;
        el.textContent = msg;
        container.appendChild(el);
        
        setTimeout(() => el.remove(), 5000);
    };

    const mostrarCarregamento = (mostrar) => {
        const el = document.getElementById('carregando');
        if (el) el.style.display = mostrar ? 'flex' : 'none';
    };

    const limpar = () => {
        document.getElementById('input-pdf').value = '';
        document.getElementById('nome-arquivo').textContent = 'Nenhum arquivo';
        document.getElementById('btn-processar').disabled = true;
        document.getElementById('tabela-empenhos-container').innerHTML = '';
        document.getElementById('notificacoes').innerHTML = '';
        document.getElementById('lista-erros').style.display = 'none';
        empenhosDados = [];
    };

    const deletar = (numero) => {
        if (!confirm('Deletar?')) return;

        try {
            const salvos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            const filtrados = salvos.filter(e => e.numero !== numero);
            localStorage.setItem('empenhos_salvos', JSON.stringify(filtrados));
            
            mostrarNotificacao('Deletado', 'sucesso');
            carregarEmpenhos();
        } catch (e) {
            mostrarNotificacao('Erro: ' + e.message, 'erro');
        }
    };

    return {
        init,
        abrirModal,
        remover,
        deletar
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(ModuloEmpenhos.init, 100));
} else {
    setTimeout(ModuloEmpenhos.init, 100);
}
