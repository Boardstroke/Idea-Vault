"""
Base Parser - Abstract base class for all financial data parsers

Each parser must implement:
- validate(): Check if the CSV has the expected structure
- parse(): Transform CSV data into a unified format
- generate_hash(): Create a unique hash for deduplication
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import List, Dict, Any, Optional
import hashlib
import pandas as pd


@dataclass
class ParsedTransaction:
    """Unified transaction format after parsing"""
    
    datasource_id: str
    transaction_hash: str
    data_transacao: date
    valor: Decimal
    descricao: str
    dados_raw: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database insertion"""
        return {
            "datasource_id": self.datasource_id,
            "transaction_hash": self.transaction_hash,
            "data_transacao": self.data_transacao,
            "valor": float(self.valor),
            "descricao": self.descricao,
            "dados_raw": self.dados_raw,
        }


@dataclass
class ParseResult:
    """Result of parsing a CSV file"""
    
    success: bool
    transactions: List[ParsedTransaction] = field(default_factory=list)
    total_rows: int = 0
    parsed_rows: int = 0
    error_rows: int = 0
    errors: List[str] = field(default_factory=list)
    periodo_inicio: Optional[date] = None
    periodo_fim: Optional[date] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response"""
        return {
            "success": self.success,
            "total_rows": self.total_rows,
            "parsed_rows": self.parsed_rows,
            "error_rows": self.error_rows,
            "errors": self.errors[:10],  # Limit errors in response
            "periodo_inicio": self.periodo_inicio.isoformat() if self.periodo_inicio else None,
            "periodo_fim": self.periodo_fim.isoformat() if self.periodo_fim else None,
        }


class BaseParser(ABC):
    """
    Abstract base class for financial data parsers.
    
    Each financial institution requires a specific parser that
    understands its CSV format and can transform it into a
    unified transaction format.
    """
    
    # Parser identification
    parser_id: str = ""
    parser_name: str = ""
    
    # Expected CSV structure
    required_columns: List[str] = []
    optional_columns: List[str] = []
    delimiter: str = ","
    encoding: str = "utf-8"
    
    def __init__(self, datasource_id: str):
        """
        Initialize parser with datasource ID.
        
        Args:
            datasource_id: ID of the datasource this parser is handling
        """
        self.datasource_id = datasource_id
    
    def validate(self, df: pd.DataFrame) -> tuple[bool, List[str]]:
        """
        Validate that the DataFrame has the expected structure.
        
        Args:
            df: DataFrame to validate
            
        Returns:
            Tuple of (is_valid, list of error messages)
        """
        errors = []
        
        # Check for required columns
        missing_cols = set(self.required_columns) - set(df.columns)
        if missing_cols:
            errors.append(f"Colunas obrigatórias faltando: {', '.join(missing_cols)}")
        
        # Check for empty DataFrame
        if df.empty:
            errors.append("Arquivo CSV está vazio")
        
        return len(errors) == 0, errors
    
    @abstractmethod
    def parse(self, df: pd.DataFrame) -> ParseResult:
        """
        Parse the DataFrame and return unified transactions.
        
        Args:
            df: DataFrame to parse
            
        Returns:
            ParseResult with parsed transactions
        """
        pass
    
    @abstractmethod
    def generate_hash(self, row: pd.Series) -> str:
        """
        Generate a unique hash for a transaction row.
        
        This hash is used for deduplication. The same transaction
        should always generate the same hash.
        
        Args:
            row: DataFrame row representing a transaction
            
        Returns:
            MD5 hash string (64 characters)
        """
        pass
    
    def read_csv(self, file_path: str) -> pd.DataFrame:
        """
        Read CSV file with parser-specific settings.
        
        Args:
            file_path: Path to the CSV file
            
        Returns:
            DataFrame with CSV contents
        """
        return pd.read_csv(
            file_path,
            delimiter=self.delimiter,
            encoding=self.encoding,
            dtype=str,  # Read all as strings initially
        )
    
    def _md5_hash(self, *args) -> str:
        """
        Generate MD5 hash from multiple values.
        
        Args:
            *args: Values to include in the hash
            
        Returns:
            MD5 hash string (32 characters)
        """
        combined = "|".join(str(arg) for arg in args if arg is not None)
        return hashlib.md5(combined.encode("utf-8")).hexdigest()
    
    def _parse_decimal(self, value: Any) -> Decimal:
        """
        Parse a value to Decimal, handling different formats.
        
        Args:
            value: Value to parse (string, float, or Decimal)
            
        Returns:
            Decimal value
        """
        if pd.isna(value) or value == "":
            return Decimal("0")
        
        # Convert to string and clean up
        str_value = str(value).strip()
        
        # Handle Brazilian format (1.234,56)
        if "," in str_value and "." in str_value:
            str_value = str_value.replace(".", "").replace(",", ".")
        elif "," in str_value:
            str_value = str_value.replace(",", ".")
        
        return Decimal(str_value)
    
    def _parse_date(self, value: str, format: str = "%d/%m/%Y") -> Optional[date]:
        """
        Parse a date string to date object.
        
        Args:
            value: Date string to parse
            format: Expected date format
            
        Returns:
            date object or None if parsing fails
        """
        if pd.isna(value) or value == "":
            return None
        
        try:
            from datetime import datetime
            return datetime.strptime(str(value).strip(), format).date()
        except ValueError:
            return None

