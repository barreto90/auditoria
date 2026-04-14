#!/usr/bin/env python3
"""
EXEMPLOS DE USO DA API
Teste os endpoints da API de Empenhos

Para usar via curl, execute os comandos deste arquivo.
Para usar via Python, rode o script.
"""

import requests
import json
import time
from pathlib import Path

API_BASE = "http://localhost:8000/api"

# ============================================================================
# EXEMPLOS VIA CURL
# ============================================================================

"""
Descomente e execute no terminal para testar via curl:

# 1. PROCESSAR PDF
curl -X POST -F "file=@seu_arquivo.pdf" http://localhost:8000/api/processar-pdf | json_pp

# 2. LISTAR EMPENHOS
curl http://localhost:8000/api/empenhos | json_pp

# 3. SALVAR EMPENHOS
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"empenhos":[{"numero":"2026NE000001","data_referencia":"05/01/2026",...}]}' \
  http://localhost:8000/api/salvar-empenhos

# 4. DELETAR EMPENHO
curl -X DELETE http://localhost:8000/api/empenhos/2026NE000001

# 5. TESTAR SAÚDE DA API
curl http://localhost:8000/
"""

# ============================================================================
# EXEMPLOS EM PYTHON
# ============================================================================

class ClienteEmpenhos:
    """Cliente Python para API de Empenhos"""
    
    def __init__(self, base_url=API_BASE):
        self.base_url = base_url
        self.session = requests.Session()
    
    def testar_conexao(self):
        """Testa se API está disponível"""
        try:
            response = self.session.get(f"{self.base_url}/../")
            return response.status_code == 200
        except:
            return False
    
    def processar_pdf(self, caminho_arquivo):
        """Processa um arquivo PDF"""
        print(f"\n📥 Processando: {caminho_arquivo}")
        
        with open(caminho_arquivo, 'rb') as f:
            files = {'file': f}
            response = self.session.post(
                f"{self.base_url}/processar-pdf",
                files=files
            )
        
        if response.status_code == 200:
            resultado = response.json()
            print(f"✓ {len(resultado['empenhos'])} empenho(s) extraído(s)")
            if resultado['erros']:
                print(f"⚠️  {len(resultado['erros'])} erro(s)/aviso(s)")
            return resultado
        else:
            print(f"✗ Erro: {response.text}")
            return None
    
    def listar_empenhos(self):
        """Lista todos os empenhos cadastrados"""
        print("\n📊 Listando empenhos...")
        
        response = self.session.get(f"{self.base_url}/empenhos")
        
        if response.status_code == 200:
            dados = response.json()
            empenhos = dados['empenhos']
            print(f"✓ {len(empenhos)} empenho(s) cadastrado(s)")
            return empenhos
        else:
            print(f"✗ Erro: {response.text}")
            return None
    
    def salvar_empenho(self, empenho):
        """Salva um empenho no banco"""
        print(f"\n💾 Salvando: {empenho['numero']}")
        
        response = self.session.post(
            f"{self.base_url}/salvar-empenhos",
            json={"empenhos": [empenho]}
        )
        
        if response.status_code == 200:
            print(f"✓ Salvo com sucesso")
            return True
        else:
            print(f"✗ Erro: {response.text}")
            return False
    
    def deletar_empenho(self, numero):
        """Deleta um empenho"""
        print(f"\n🗑️  Deletando: {numero}")
        
        response = self.session.delete(f"{self.base_url}/empenhos/{numero}")
        
        if response.status_code == 200:
            print(f"✓ Deletado com sucesso")
            return True
        else:
            print(f"✗ Erro: {response.text}")
            return False
    
    def exibir_resultados(self, resultado):
        """Exibe resultados do processamento"""
        print("\n" + "="*70)
        print("RESULTADO DO PROCESSAMENTO")
        print("="*70)
        
        # Empenhos extraídos
        print(f"\n✓ EMPENHOS EXTRAÍDOS: {len(resultado['empenhos'])}\n")
        
        for emp in resultado['empenhos']:
            print(f"  {emp['numero']:20} | {emp['data_referencia']:12} | {emp['credor']['razao_social'][:30]}")
        
        # Erros
        if resultado['erros']:
            print(f"\n⚠️  ERROS/AVISOS: {len(resultado['erros'])}\n")
            for erro in resultado['erros']:
                tipo = erro.get('tipo', 'ERRO')
                emp = erro.get('empenho', '')
                msg = erro.get('mensagem', '')
                print(f"  [{tipo}] {emp}: {msg}")
        
        print("\n" + "="*70)


# ============================================================================
# EXEMPLO DE USO
# ============================================================================

def exemplo_completo():
    """Exemplo de fluxo completo"""
    
    cliente = ClienteEmpenhos()
    
    # 1. Testa conexão
    print("\n🔌 Verificando conexão com API...")
    if not cliente.testar_conexao():
        print("✗ API não está disponível!")
        print("  Inicie com: python empenho_backend.py")
        return
    
    print("✓ API disponível!")
    
    # 2. Processa PDF (exemplo)
    pdf_path = "Relatorio_14042026130515.pdf"
    
    if Path(pdf_path).exists():
        resultado = cliente.processar_pdf(pdf_path)
        
        if resultado:
            cliente.exibir_resultados(resultado)
            
            # 3. Salva empenhos
            print("\n💾 Salvando empenhos...")
            for empenho in resultado['empenhos']:
                cliente.salvar_empenho(empenho)
    else:
        print(f"\n⚠️  Arquivo não encontrado: {pdf_path}")
        print("  Coloque um PDF SIGEF na pasta raiz")
    
    # 4. Lista todos os cadastrados
    time.sleep(1)
    empenhos = cliente.listar_empenhos()
    
    if empenhos:
        print("\n📋 Empenhos cadastrados:")
        for emp in empenhos:
            print(f"  • {emp['numero']} - {emp['razao_social']}")


# ============================================================================
# TESTES UNITÁRIOS
# ============================================================================

def testar_api():
    """Testa endpoints da API"""
    
    print("\n" + "="*70)
    print("TESTES DE API")
    print("="*70)
    
    cliente = ClienteEmpenhos()
    
    # Teste 1: Conexão
    print("\n[1/4] Testando conexão...")
    if cliente.testar_conexao():
        print("✓ OK")
    else:
        print("✗ FALHOU - API não disponível")
        return
    
    # Teste 2: Listar vazio
    print("[2/4] Listando empenhos...")
    empenhos = cliente.listar_empenhos()
    if empenhos is not None:
        print(f"✓ OK - {len(empenhos)} registros")
    else:
        print("✗ FALHOU")
        return
    
    # Teste 3: Salvar empenho de teste
    print("[3/4] Salvando empenho de teste...")
    empenho_teste = {
        "numero": "TEST2026NE999999",
        "data_referencia": "01/01/2026",
        "credor": {
            "cnpj": "00000000000191",
            "razao_social": "EMPRESA DE TESTE LTDA"
        },
        "historico": ["Teste de empenho"],
        "tem_contrato": False,
        "tem_emenda": False,
        "evento": "Emissão de Empenho da Despesa"
    }
    
    if cliente.salvar_empenho(empenho_teste):
        print("✓ OK")
    else:
        print("✗ FALHOU")
        return
    
    # Teste 4: Deletar
    print("[4/4] Deletando empenho de teste...")
    if cliente.deletar_empenho("TEST2026NE999999"):
        print("✓ OK")
    else:
        print("✗ FALHOU")
        return
    
    print("\n" + "="*70)
    print("✓ TODOS OS TESTES PASSARAM!")
    print("="*70)


# ============================================================================
# EXECUTAR
# ============================================================================

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "test":
            testar_api()
        elif sys.argv[1] == "exemplo":
            exemplo_completo()
    else:
        print("""
USO: python exemplos_api.py [comando]

Comandos:
  test      - Executa testes da API
  exemplo   - Executa exemplo completo
  
Exemplos de curl:
  
  # Processar PDF
  curl -X POST -F "file=@seu_arquivo.pdf" \\
    http://localhost:8000/api/processar-pdf
  
  # Listar empenhos
  curl http://localhost:8000/api/empenhos
  
  # Deletar empenho
  curl -X DELETE http://localhost:8000/api/empenhos/2026NE000001

""")
