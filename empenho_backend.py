"""
Backend para extração de Notas de Empenho do SIGEF
Utiliza PyPDF2 para leitura de PDFs e FastAPI para exposição de endpoints
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Tuple
import sqlite3
import PyPDF2
import re
from datetime import datetime
import json
from pathlib import Path

# ============================================================================
# CONFIGURAÇÃO
# ============================================================================

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "empenhos.db"

# ============================================================================
# MODELOS
# ============================================================================

class Credor(BaseModel):
    cnpj: str
    razao_social: str

class Empenho(BaseModel):
    numero: str
    data_referencia: str
    credor: Credor
    historico: List[str]
    contrato: Optional[str] = None
    tem_contrato: bool
    tem_emenda: bool
    evento: str

class DadosExtraidos(BaseModel):
    empenhos: List[Empenho]
    erros: List[Dict]

# ============================================================================
# BANCO DE DADOS
# ============================================================================

def inicializar_db():
    """Cria tabelas se não existirem"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS credores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cnpj TEXT UNIQUE NOT NULL,
            razao_social TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS empenhos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT UNIQUE NOT NULL,
            data_referencia DATE NOT NULL,
            credor_id INTEGER NOT NULL,
            historico TEXT NOT NULL,
            contrato TEXT,
            tem_contrato BOOLEAN DEFAULT 0,
            tem_emenda BOOLEAN DEFAULT 0,
            evento TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (credor_id) REFERENCES credores (id)
        )
    """)
    
    conn.commit()
    conn.close()

def salvar_credor(cnpj: str, razao_social: str) -> int:
    """Salva ou retorna ID do credor existente"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM credores WHERE cnpj = ?", (cnpj,))
    resultado = cursor.fetchone()
    
    if resultado:
        conn.close()
        return resultado[0]
    
    cursor.execute(
        "INSERT INTO credores (cnpj, razao_social) VALUES (?, ?)",
        (cnpj, razao_social)
    )
    conn.commit()
    credor_id = cursor.lastrowid
    conn.close()
    return credor_id

def verificar_duplicado(numero: str) -> Optional[Dict]:
    """Verifica se empenho já existe"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT e.*, c.cnpj, c.razao_social 
        FROM empenhos e
        JOIN credores c ON e.credor_id = c.id
        WHERE e.numero = ?
    """, (numero,))
    
    resultado = cursor.fetchone()
    conn.close()
    
    if resultado:
        return {
            "numero": resultado[1],
            "data_referencia": resultado[2],
            "cnpj": resultado[10],
            "razao_social": resultado[11],
            "historico": resultado[4],
            "tem_contrato": bool(resultado[6]),
            "tem_emenda": bool(resultado[7]),
            "evento": resultado[8]
        }
    return None

def salvar_empenho(empenho: Empenho, atualizar: bool = False) -> bool:
    """Salva empenho no banco de dados"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        credor_id = salvar_credor(empenho.credor.cnpj, empenho.credor.razao_social)
        historico_str = "\n".join(empenho.historico)
        
        if atualizar:
            cursor.execute("""
                UPDATE empenhos 
                SET data_referencia = ?, credor_id = ?, historico = ?, 
                    contrato = ?, tem_contrato = ?, tem_emenda = ?, 
                    evento = ?, updated_at = CURRENT_TIMESTAMP
                WHERE numero = ?
            """, (
                empenho.data_referencia,
                credor_id,
                historico_str,
                empenho.contrato,
                empenho.tem_contrato,
                empenho.tem_emenda,
                empenho.evento,
                empenho.numero
            ))
        else:
            cursor.execute("""
                INSERT INTO empenhos 
                (numero, data_referencia, credor_id, historico, contrato, 
                 tem_contrato, tem_emenda, evento)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                empenho.numero,
                empenho.data_referencia,
                credor_id,
                historico_str,
                empenho.contrato,
                empenho.tem_contrato,
                empenho.tem_emenda,
                empenho.evento
            ))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        conn.close()
        raise e

def obter_empenhos() -> List[Dict]:
    """Retorna todos os empenhos com dados do credor"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT e.id, e.numero, e.data_referencia, c.cnpj, c.razao_social,
               e.historico, e.contrato, e.tem_contrato, e.tem_emenda, e.evento
        FROM empenhos e
        JOIN credores c ON e.credor_id = c.id
        ORDER BY e.created_at DESC
    """)
    
    linhas = cursor.fetchall()
    conn.close()
    
    resultado = []
    for linha in linhas:
        resultado.append({
            "id": linha[0],
            "numero": linha[1],
            "data_referencia": linha[2],
            "cnpj": linha[3],
            "razao_social": linha[4],
            "historico": linha[5].split("\n") if linha[5] else [],
            "contrato": linha[6],
            "tem_contrato": bool(linha[7]),
            "tem_emenda": bool(linha[8]),
            "evento": linha[9]
        })
    
    return resultado

# ============================================================================
# EXTRAÇÃO DE PDF
# ============================================================================

def extrair_texto_pdf(arquivo_bytes: bytes) -> str:
    """Extrai texto de arquivo PDF"""
    try:
        pdf_reader = PyPDF2.PdfReader(arquivo_bytes)
        texto = ""
        for page in pdf_reader.pages:
            texto += page.extract_text()
        return texto
    except Exception as e:
        raise Exception(f"Erro ao ler PDF: {str(e)}")

def extrair_numero_empenho(texto: str) -> Optional[str]:
    """Extrai número do empenho"""
    # Padrão: "Número 2026NE000001"
    match = re.search(r'Número\s+(\d+NE\d+)', texto)
    if match:
        return match.group(1)
    return None

def extrair_data_referencia(texto: str) -> Optional[str]:
    """Extrai data de referência"""
    # Padrão: "Data Referência 05/01/2026"
    match = re.search(r'Data Referência\s+(\d{2}/\d{2}/\d{4})', texto)
    if match:
        return match.group(1)
    return None

def extrair_credor(texto: str) -> Optional[Tuple[str, str]]:
    """Extrai CNPJ e razão social do credor"""
    # Padrão CNPJ: xxx.xxx.xxx/xxxx-xx ou xxxxxxxxxxxxxx
    match = re.search(
        r'(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\d{14})\s+([A-Z\s\-\.]+?)(?=\n|Endereço)',
        texto,
        re.MULTILINE
    )
    
    if match:
        cnpj = match.group(1).replace(".", "").replace("/", "").replace("-", "")
        razao_social = match.group(2).strip()
        return cnpj, razao_social
    
    return None

def extrair_evento(texto: str) -> Optional[str]:
    """Extrai tipo de evento"""
    # Procura por "Evento" seguido de tipo
    match = re.search(
        r'Evento\s+(.+?)(?=\n|Referência Legal)',
        texto,
        re.DOTALL
    )
    if match:
        return match.group(1).strip()
    return None

def extrair_historico(texto: str) -> List[str]:
    """Extrai histórico da despesa"""
    # Procura pela seção "Histórico"
    match = re.search(
        r'Histórico\s+(.+?)(?=\nEntrega|\nDescrição Items)',
        texto,
        re.DOTALL
    )
    
    if match:
        historico = match.group(1).strip()
        # Divide em linhas e limpa
        linhas = [linha.strip() for linha in historico.split('\n') if linha.strip()]
        return linhas
    
    return []

def extrair_contrato(texto: str) -> Optional[str]:
    """Extrai número do contrato se existir"""
    # Procura por "Contrato" seguido de número
    match = re.search(
        r'Contrato\s+(\d{4}CT\d+|\S+?)(?=\n|$)',
        texto
    )
    if match:
        valor = match.group(1).strip()
        return valor if valor.upper() != "OPCIONAL" else None
    return None

def tem_emenda_parlamentar(texto: str) -> bool:
    """Verifica se tem emenda parlamentar"""
    # Procura por "Emenda Parlamentar" com valor diferente de vazio
    match = re.search(
        r'Emenda Parlamentar\s+([^\n]+)',
        texto
    )
    if match:
        valor = match.group(1).strip()
        return valor and valor.upper() != "NÃO APLICÁVEL" and valor != ""
    return False

def dividir_empenhos_por_pagina(texto: str) -> List[str]:
    """Divide texto em múltiplas notas de empenho"""
    # Cada empenho começa com "Unidade Gestora" seguido de "Número"
    empenhos = re.split(
        r'(?=Unidade Gestora.+?Número)',
        texto,
        flags=re.DOTALL
    )
    return [e.strip() for e in empenhos if e.strip()]

def processar_pdf(arquivo_bytes: bytes) -> DadosExtraidos:
    """Processa PDF e extrai dados de empenhos"""
    
    erros = []
    empenhos_extraidos = []
    
    try:
        # Extrai texto do PDF
        texto_completo = extrair_texto_pdf(arquivo_bytes)
        
        # Divide em múltiplos empenhos
        textos_empenho = dividir_empenhos_por_pagina(texto_completo)
        
        if not textos_empenho:
            erros.append({
                "tipo": "ERRO_CRITICO",
                "mensagem": "Nenhuma nota de empenho foi encontrada no PDF"
            })
            return DadosExtraidos(empenhos=[], erros=erros)
        
        for idx, texto_empenho in enumerate(textos_empenho, 1):
            try:
                # Extrai campo evento primeiro
                evento = extrair_evento(texto_empenho)
                
                # Verifica se é "Emissão de Empenho da Despesa"
                if not evento or "Emissão de Empenho da Despesa" not in evento:
                    erros.append({
                        "tipo": "AVISO",
                        "empenho": f"#{idx}",
                        "mensagem": f"Empenho ignorado: evento '{evento}' não é 'Emissão de Empenho da Despesa'"
                    })
                    continue
                
                # Extrai número
                numero = extrair_numero_empenho(texto_empenho)
                if not numero:
                    erros.append({
                        "tipo": "ERRO",
                        "empenho": f"#{idx}",
                        "mensagem": "Número do empenho não encontrado"
                    })
                    continue
                
                # Extrai data
                data = extrair_data_referencia(texto_empenho)
                if not data:
                    erros.append({
                        "tipo": "ERRO",
                        "empenho": numero,
                        "mensagem": "Data de referência não encontrada"
                    })
                    continue
                
                # Extrai credor
                dados_credor = extrair_credor(texto_empenho)
                if not dados_credor:
                    erros.append({
                        "tipo": "ERRO",
                        "empenho": numero,
                        "mensagem": "Dados do credor (CNPJ/Razão Social) não encontrados"
                    })
                    continue
                
                cnpj, razao_social = dados_credor
                
                # Extrai histórico
                historico = extrair_historico(texto_empenho)
                
                # Extrai contrato
                contrato = extrair_contrato(texto_empenho)
                
                # Verifica emenda
                tem_emenda = tem_emenda_parlamentar(texto_empenho)
                
                # Cria objeto empenho
                empenho = Empenho(
                    numero=numero,
                    data_referencia=data,
                    credor=Credor(cnpj=cnpj, razao_social=razao_social),
                    historico=historico if historico else ["Sem descrição"],
                    contrato=contrato,
                    tem_contrato=bool(contrato),
                    tem_emenda=tem_emenda,
                    evento=evento
                )
                
                empenhos_extraidos.append(empenho)
                
            except Exception as e:
                erros.append({
                    "tipo": "ERRO",
                    "empenho": f"#{idx}",
                    "mensagem": f"Erro ao processar: {str(e)}"
                })
                continue
        
        return DadosExtraidos(empenhos=empenhos_extraidos, erros=erros)
        
    except Exception as e:
        erros.append({
            "tipo": "ERRO_CRITICO",
            "mensagem": f"Erro ao processar arquivo: {str(e)}"
        })
        return DadosExtraidos(empenhos=[], erros=erros)

# ============================================================================
# ENDPOINTS
# ============================================================================

@app.on_event("startup")
async def startup():
    """Inicializa banco ao iniciar"""
    inicializar_db()

@app.post("/api/processar-pdf")
async def processar_pdf_endpoint(file: UploadFile = File(...)):
    """Endpoint para processar PDF com notas de empenho"""
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Arquivo deve ser PDF")
    
    try:
        conteudo = await file.read()
        resultado = processar_pdf(conteudo)
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar: {str(e)}")

@app.post("/api/salvar-empenhos")
async def salvar_empenhos(dados: Dict):
    """Salva empenhos no banco de dados"""
    
    try:
        for empenho_dados in dados.get("empenhos", []):
            empenho = Empenho(**empenho_dados)
            
            # Verifica duplicado
            duplicado = verificar_duplicado(empenho.numero)
            if duplicado and not empenho_dados.get("forcar_atualizacao"):
                continue
            
            salvar_empenho(empenho, atualizar=bool(duplicado))
        
        return {"status": "sucesso", "mensagem": "Empenhos salvos com sucesso"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar: {str(e)}")

@app.get("/api/empenhos")
async def listar_empenhos():
    """Lista todos os empenhos cadastrados"""
    return {"empenhos": obter_empenhos()}

@app.delete("/api/empenhos/{numero}")
async def deletar_empenho(numero: str):
    """Deleta um empenho"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM empenhos WHERE numero = ?", (numero,))
    conn.commit()
    conn.close()
    
    return {"status": "deletado"}

@app.get("/")
async def root():
    """Health check"""
    return {"status": "OK", "versao": "1.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
