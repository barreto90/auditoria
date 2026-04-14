const ModuloEmpenhos = (() => {
    let empenhosDados = [];
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

            exibirResultados(resultado);
            if (resultado.erros.length > 0) exibirErros(resultado.erros);
            
            mostrarNotificacao(`${resultado.empenhos.length} empenho(s)`, 'sucesso');

        } catch (erro) {
            mostrarNotificacao(`Erro: ${erro.message}`, 'erro');
        } finally {
            mostrarCarregamento(false);
        }
    };

    const extrairEmpenhos = (texto) => {
        const erros = [];
        const empenhos = [];

        // Divide o texto em blocos por empenho
        const blocos = texto.split(/Número\s+(\d{4}NE\d{6})/);
        
        for (let i = 1; i < blocos.length; i += 2) {
            const numero = blocos[i];
            const bloco = blocos[i + 1] || '';

            if (numerosProcessados.has(numero)) continue;
            numerosProcessados.add(numero);

            try {
                const empenho = {
                    numero: numero,
                    data_referencia: extrairCampo(bloco, /Data Referência\s+(\d{2}\/\d{2}\/\d{4})/),
                    credor: extrairCredor(bloco),
                    historico: [extrairCampo(bloco, /Histórico\s*\n([^\n]+(?:\n(?!Entrega|Data)[^\n]+)*)/s)],
                    tem_contrato: /Contrato\s+\d{4}CT\d{6}/.test(bloco),
                    tem_emenda: false,
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

    const extrairCampo = (texto, regex) => {
        const match = texto.match(regex);
        if (match && match[1]) {
            return match[1].trim().substring(0, 300);
        }
        return 'Sem descrição';
    };

    const extrairCredor = (texto) => {
        const match = texto.match(/Credor\s+([0-9.\/\-]+)\s+([A-Z\s\-]+?)(?=\n|Endereço)/i);
        
        let cnpj = '';
        let razaoSocial = '';

        if (match) {
            cnpj = match[1];
            
            // Busca FORNECEDORES
            if (window.FORNECEDORES && window.FORNECEDORES[cnpj]) {
                razaoSocial = window.FORNECEDORES[cnpj];
            }
        }

        return {
            cnpj: cnpj || '00.000.000/0000-00',
            razao_social: razaoSocial
        };
    };

    const exibirResultados = (resultado) => {
        const container = document.getElementById('tabela-empenhos-container');
        if (!container) return;
        
        if (resultado.empenhos.length === 0) {
            container.innerHTML = '<p class="aviso">Nenhum empenho</p>';
            return;
        }

        let html = '<div class="tabela-responsiva"><table class="tabela-empenhos"><thead><tr>';
        html += '<th>Nº Empenho</th><th>Data</th><th>CNPJ</th><th>Razão Social</th><th>Contrato</th><th>Histórico</th><th>Status</th><th>Ações</th>';
        html += '</tr></thead><tbody>';

        resultado.empenhos.forEach((emp, idx) => {
            html += '<tr>';
            html += `<td>${emp.numero}</td>`;
            html += `<td>${emp.data_referencia}</td>`;
            html += `<td>${emp.credor.cnpj}</td>`;
            html += `<td>${emp.credor.razao_social || '(sem nome)'}</td>`;
            html += `<td>${emp.tem_contrato ? '✓' : '—'}</td>`;
            html += `<td>${emp.historico[0].substring(0, 20)}...</td>`;
            html += `<td><span class="status novo">✓ Novo</span></td>`;
            html += `<td><button class="btn-mini" onclick="ModuloEmpenhos.editar(${idx})">✎</button>`;
            html += `<button class="btn-mini" onclick="ModuloEmpenhos.remover(${idx})">✕</button></td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    };

    const exibirErros = (erros) => {
        const container = document.getElementById('lista-erros');
        if (!container) return;
        
        let html = '';
        erros.forEach(e => {
            html += `<div class="erro-item tipo-${e.tipo.toLowerCase()}">`;
            html += `<strong>${e.tipo}${e.empenho ? ' [' + e.empenho + ']' : ''}:</strong> ${e.mensagem}`;
            html += '</div>';
        });

        container.innerHTML = html;
        container.style.display = 'block';
    };

    const editar = (idx) => {
        if (idx >= empenhosDados.length) return;
        const emp = empenhosDados[idx];
        const modal = document.getElementById('modal-editar-empenho');
        if (!modal) return;

        document.getElementById('edit-numero').value = emp.numero;
        document.getElementById('edit-data').value = emp.data_referencia;
        document.getElementById('edit-cnpj').value = emp.credor.cnpj;
        document.getElementById('edit-razao').value = emp.credor.razao_social || '';
        document.getElementById('edit-historico').value = emp.historico[0];
        document.getElementById('edit-evento').value = emp.evento;
        document.getElementById('edit-contrato').checked = emp.tem_contrato;

        document.getElementById('btn-salvar-edicao').onclick = () => {
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
            modal.style.display = 'none';
            exibirResultados({ empenhos: empenhosDados, erros: [] });
        };
        
        modal.style.display = 'block';
    };

    const remover = (idx) => {
        if (confirm('Remover?')) {
            empenhosDados.splice(idx, 1);
            exibirResultados({ empenhos: empenhosDados, erros: [] });
        }
    };

    const salvarTodos = () => {
        if (empenhosDados.length === 0) {
            mostrarNotificacao('Nenhum empenho', 'aviso');
            return;
        }

        try {
            const salvos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            empenhosDados.forEach(emp => {
                const idx = salvos.findIndex(e => e.numero === emp.numero);
                if (idx >= 0) {
                    salvos[idx] = emp;
                } else {
                    salvos.push(emp);
                }
            });
            
            localStorage.setItem('empenhos_salvos', JSON.stringify(salvos));
            mostrarNotificacao('Salvos!', 'sucesso');
            limpar();
            carregarEmpenhos();
        } catch (e) {
            mostrarNotificacao('Erro: ' + e.message, 'erro');
        }
    };

    const carregarEmpenhos = () => {
        try {
            const empenhos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
            exibirTabelaSalvos(empenhos);
        } catch (e) {}
    };

    const exibirTabelaSalvos = (empenhos) => {
        const container = document.getElementById('tabela-salvos-container');
        if (!container) return;
        
        if (empenhos.length === 0) {
            container.innerHTML = '<p class="aviso">Nenhum cadastrado</p>';
            return;
        }

        let html = '<div class="tabela-responsiva"><table class="tabela-empenhos"><thead><tr>';
        html += '<th>Nº Empenho</th><th>Data</th><th>CNPJ</th><th>Razão Social</th><th>Contrato</th><th>Ações</th>';
        html += '</tr></thead><tbody>';

        empenhos.forEach(emp => {
            html += '<tr>';
            html += `<td>${emp.numero}</td>`;
            html += `<td>${emp.data_referencia}</td>`;
            html += `<td>${emp.credor.cnpj}</td>`;
            html += `<td>${emp.credor.razao_social || '(sem nome)'}</td>`;
            html += `<td>${emp.tem_contrato ? '✓' : '—'}</td>`;
            html += `<td><button class="btn-mini" onclick="ModuloEmpenhos.deletar('${emp.numero}')">🗑</button></td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    };

    const mostrarNotificacao = (msg, tipo) => {
        const container = document.getElementById('notificacoes');
        if (!container) return;
        
        const el = document.createElement('div');
        el.className = 'notificacao ' + tipo;
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
        document.getElementById('nome-arquivo').textContent = 'Nenhum';
        document.getElementById('btn-processar').disabled = true;
        document.getElementById('tabela-empenhos-container').innerHTML = '';
        empenhosDados = [];
    };

    const deletar = (numero) => {
        if (!confirm('Deletar?')) return;
        const salvos = JSON.parse(localStorage.getItem('empenhos_salvos') || '[]');
        const filtrados = salvos.filter(e => e.numero !== numero);
        localStorage.setItem('empenhos_salvos', JSON.stringify(filtrados));
        mostrarNotificacao('Deletado', 'sucesso');
        carregarEmpenhos();
    };

    return { init, editar, remover, deletar };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(ModuloEmpenhos.init, 100));
} else {
    setTimeout(ModuloEmpenhos.init, 100);
}
