"""
Parsers Module - Extensible CSV parsing system for financial data

This module provides a plugin-like architecture for parsing CSV files
from different financial institutions.
"""

from .base import BaseParser, ParseResult, ParsedTransaction
from .registry import ParserRegistry, get_parser
from .nubank_extrato import NubankExtratoParser
from .nubank_fatura import NubankFaturaParser

__all__ = [
    "BaseParser",
    "ParseResult",
    "ParsedTransaction",
    "ParserRegistry",
    "get_parser",
    "NubankExtratoParser",
    "NubankFaturaParser",
]

