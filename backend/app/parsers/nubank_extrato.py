"""
Nubank Extrato Parser - Parser for Nubank bank statement CSV files

Expected CSV format:
    Data,Valor,Identificador,Descrição
    01/01/2025,-86.77,6775c165-0017-46c4-859b-d9fdecb24bc9,"Transferência enviada pelo Pix..."
    
The Identificador column contains a UUID which we use directly as the transaction hash.
"""

import pandas as pd
from datetime import date
from decimal import Decimal
from typing import List

from .base import BaseParser, ParseResult, ParsedTransaction


class NubankExtratoParser(BaseParser):
    """Parser for Nubank bank account statements (NuConta)"""
    
    parser_id = "nubank_extrato"
    parser_name = "Nubank - Extrato Conta"
    
    required_columns = ["Data", "Valor", "Identificador", "Descrição"]
    optional_columns = []
    delimiter = ","
    encoding = "utf-8"
    
    def parse(self, df: pd.DataFrame) -> ParseResult:
        """
        Parse Nubank bank statement CSV.
        
        Args:
            df: DataFrame with Nubank extrato data
            
        Returns:
            ParseResult with parsed transactions
        """
        # Validate first
        is_valid, errors = self.validate(df)
        if not is_valid:
            return ParseResult(
                success=False,
                total_rows=len(df),
                errors=errors,
            )
        
        transactions: List[ParsedTransaction] = []
        parse_errors: List[str] = []
        error_count = 0
        
        dates: List[date] = []
        
        for idx, row in df.iterrows():
            try:
                # Parse date
                data_transacao = self._parse_date(row["Data"], "%d/%m/%Y")
                if data_transacao is None:
                    parse_errors.append(f"Linha {idx + 2}: Data inválida '{row['Data']}'")
                    error_count += 1
                    continue
                
                dates.append(data_transacao)
                
                # Parse value
                valor = self._parse_decimal(row["Valor"])
                
                # Get UUID identifier (use as hash directly)
                identificador = str(row["Identificador"]).strip()
                if not identificador or identificador == "nan":
                    parse_errors.append(f"Linha {idx + 2}: Identificador vazio")
                    error_count += 1
                    continue
                
                # Use the UUID as the hash (it's already unique)
                transaction_hash = self._md5_hash(
                    self.datasource_id,
                    identificador
                )
                
                # Get description
                descricao = str(row["Descrição"]).strip() if pd.notna(row["Descrição"]) else ""
                
                # Store raw data
                dados_raw = {
                    "data": row["Data"],
                    "valor": str(row["Valor"]),
                    "identificador": identificador,
                    "descricao": descricao,
                }
                
                transactions.append(ParsedTransaction(
                    datasource_id=self.datasource_id,
                    transaction_hash=transaction_hash,
                    data_transacao=data_transacao,
                    valor=valor,
                    descricao=descricao,
                    dados_raw=dados_raw,
                ))
                
            except Exception as e:
                parse_errors.append(f"Linha {idx + 2}: Erro ao processar - {str(e)}")
                error_count += 1
        
        # Calculate period
        periodo_inicio = min(dates) if dates else None
        periodo_fim = max(dates) if dates else None
        
        return ParseResult(
            success=len(transactions) > 0,
            transactions=transactions,
            total_rows=len(df),
            parsed_rows=len(transactions),
            error_rows=error_count,
            errors=parse_errors,
            periodo_inicio=periodo_inicio,
            periodo_fim=periodo_fim,
        )
    
    def generate_hash(self, row: pd.Series) -> str:
        """
        Generate hash using the UUID identifier from Nubank.
        
        For Nubank extratos, we combine the datasource_id with the
        original UUID to ensure uniqueness across datasources.
        
        Args:
            row: DataFrame row with transaction data
            
        Returns:
            MD5 hash string
        """
        identificador = str(row["Identificador"]).strip()
        return self._md5_hash(self.datasource_id, identificador)

