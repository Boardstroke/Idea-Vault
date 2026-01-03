"""
Nubank Fatura Parser - Parser for Nubank credit card invoice CSV files

Expected CSV format:
    date,title,amount
    2025-01-01,Mercado Encantada,52.40
    2024-12-31,Postolagoa,38.49

Since there's no unique identifier, we generate a hash from:
    datasource_id + date + title + amount
"""

import pandas as pd
from datetime import date
from decimal import Decimal
from typing import List

from .base import BaseParser, ParseResult, ParsedTransaction


class NubankFaturaParser(BaseParser):
    """Parser for Nubank credit card invoices"""
    
    parser_id = "nubank_fatura"
    parser_name = "Nubank - Fatura Cartão"
    
    required_columns = ["date", "title", "amount"]
    optional_columns = []
    delimiter = ","
    encoding = "utf-8"
    
    def parse(self, df: pd.DataFrame) -> ParseResult:
        """
        Parse Nubank credit card invoice CSV.
        
        Args:
            df: DataFrame with Nubank fatura data
            
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
                # Parse date (format: YYYY-MM-DD)
                data_transacao = self._parse_date(row["date"], "%Y-%m-%d")
                if data_transacao is None:
                    parse_errors.append(f"Linha {idx + 2}: Data inválida '{row['date']}'")
                    error_count += 1
                    continue
                
                dates.append(data_transacao)
                
                # Parse amount (positive = expense, negative = credit/payment)
                valor = self._parse_decimal(row["amount"])
                
                # Get title (description)
                titulo = str(row["title"]).strip() if pd.notna(row["title"]) else ""
                if not titulo:
                    parse_errors.append(f"Linha {idx + 2}: Título vazio")
                    error_count += 1
                    continue
                
                # Generate hash from all fields (no unique ID available)
                transaction_hash = self._md5_hash(
                    self.datasource_id,
                    row["date"],
                    titulo,
                    str(row["amount"]),
                )
                
                # Store raw data
                dados_raw = {
                    "date": row["date"],
                    "title": titulo,
                    "amount": str(row["amount"]),
                }
                
                transactions.append(ParsedTransaction(
                    datasource_id=self.datasource_id,
                    transaction_hash=transaction_hash,
                    data_transacao=data_transacao,
                    valor=valor,
                    descricao=titulo,
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
        Generate hash for credit card transactions.
        
        Since Nubank fatura doesn't have unique IDs, we create a hash
        from the combination of date, title, and amount.
        
        Args:
            row: DataFrame row with transaction data
            
        Returns:
            MD5 hash string
        """
        return self._md5_hash(
            self.datasource_id,
            row["date"],
            str(row["title"]).strip(),
            str(row["amount"]),
        )

