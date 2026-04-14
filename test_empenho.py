#!/usr/bin/env python3
"""
Script de teste para validar extração de notas de empenho
Execute: python test_empenho.py seu_arquivo.pdf
"""

import sys
import json
from pathlib import Path

# Importa funções do backend
from empenho_backend import (
    extrair_texto_pdf,
    dividir_empenhos_por_pagina,
    extrair_numero_empenho,
    extrair_data_referencia,
    extrair_credor,
    extrair_evento,
    extrair_historico,
    extrair_contrato,
    tem_emenda_parlamentar
)

def testar_pdf(caminho_arquivo):
    """Testa extração de um arquivo PDF"""
    
    print(f"\n{'='*70}")
    print(f"🔍 TESTE DE EXTRAÇÃO DE NOTAS DE EMPENHO")
    print(f"{'='*70}\n")
    
    # Lê arquivo
    try:
        with open(caminho_arquivo, 'rb') as f:
            conteudo = f.read()
        print(f"✓ Arquivo lido: {caminho_arquivo}")
        print(f"  Tamanho: {len(conteudo) / 1024:.2f} KB\n")
    except FileNotFoundError:
        print(f"✗ ERRO: Arquivo não encontrado: {caminho_arquivo}")
        sys.exit(1)

    # Extrai texto
    try:
        texto_completo = extrair_texto_pdf(conteudo)
        print(f"✓ Texto extraído do PDF")
        print(f"  Caracteres: {len(texto_completo):,}\n")
    except Exception as e:
        print(f"✗ ERRO ao extrair texto: {e}")
        sys.exit(1)

    # Divide em múltiplos empenhos
    textos_empenho = dividir_empenhos_por_pagina(texto_completo)
    print(f"✓ Encontrados {len(textos_empenho)} empenho(s)\n")

    if not textos_empenho:
        print("⚠️  AVISO: Nenhum empenho encontrado!")
        return

    # Processa cada empenho
    for idx, texto_empenho in enumerate(textos_empenho, 1):
        print(f"{'─'*70}")
        print(f"📋 EMPENHO #{idx}")
        print(f"{'─'*70}\n")

        # Evento
        evento = extrair_evento(texto_empenho)
        print(f"Evento: {evento if evento else '❌ NÃO ENCONTRADO'}")
        
        if not evento:
            print("  ⚠️  Será ignorado (evento não encontrado)\n")
            continue

        if "Emissão de Empenho da Despesa" not in evento:
            print(f"  ⚠️  Será ignorado (evento não é 'Emissão de Empenho da Despesa')\n")
            continue

        print("  ✓ Evento válido")

        # Número
        numero = extrair_numero_empenho(texto_empenho)
        print(f"\nNúmero: {numero if numero else '❌ NÃO ENCONTRADO'}")

        # Data
        data = extrair_data_referencia(texto_empenho)
        print(f"Data: {data if data else '❌ NÃO ENCONTRADO'}")

        # Credor
        dados_credor = extrair_credor(texto_empenho)
        if dados_credor:
            cnpj, razao_social = dados_credor
            print(f"CNPJ: {cnpj}")
            print(f"Razão Social: {razao_social}")
        else:
            print(f"Credor: ❌ NÃO ENCONTRADO")

        # Contrato
        contrato = extrair_contrato(texto_empenho)
        print(f"Contrato: {'✓ SIM' if contrato else '—'}")
        if contrato:
            print(f"  Número/Ref: {contrato}")

        # Emenda Parlamentar
        emenda = tem_emenda_parlamentar(texto_empenho)
        print(f"Emenda Parlamentar: {'✓ SIM' if emenda else '—'}")

        # Histórico
        historico = extrair_historico(texto_empenho)
        print(f"Histórico: {len(historico)} linha(s)")
        if historico:
            for linha in historico[:3]:  # Mostra primeiras 3
                print(f"  • {linha[:60]}...")
            if len(historico) > 3:
                print(f"  ... e mais {len(historico) - 3} linha(s)")

        print()

    print(f"{'='*70}")
    print(f"✓ TESTE CONCLUÍDO COM SUCESSO!")
    print(f"{'='*70}\n")

def main():
    if len(sys.argv) < 2:
        print("Uso: python test_empenho.py <arquivo.pdf>")
        print("\nExemplo:")
        print("  python test_empenho.py Relatorio_14042026130515.pdf")
        sys.exit(1)

    arquivo = sys.argv[1]
    testar_pdf(arquivo)

if __name__ == "__main__":
    main()
