"""
Parser Registry - Central registry for all available parsers

This module provides a plugin-like architecture where parsers
can be registered and retrieved by their parser_id.

Usage:
    from app.parsers import get_parser

    parser = get_parser("nubank_extrato", datasource_id="nubank_extrato")
    result = parser.parse(df)
"""

from typing import Dict, Type, Optional
from .base import BaseParser
from .nubank_extrato import NubankExtratoParser
from .nubank_fatura import NubankFaturaParser


class ParserRegistry:
    """
    Registry for parser classes.

    Parsers are registered by their parser_id and can be
    instantiated with a datasource_id.
    """

    _parsers: Dict[str, Type[BaseParser]] = {}

    @classmethod
    def register(cls, parser_class: Type[BaseParser]) -> Type[BaseParser]:
        """
        Register a parser class.

        Can be used as a decorator:
            @ParserRegistry.register
            class MyParser(BaseParser):
                parser_id = "my_parser"
                ...

        Args:
            parser_class: Parser class to register

        Returns:
            The same parser class (for decorator use)
        """
        if not parser_class.parser_id:
            raise ValueError(f"Parser {parser_class.__name__} must have a parser_id")

        cls._parsers[parser_class.parser_id] = parser_class
        return parser_class

    @classmethod
    def get(cls, parser_id: str, datasource_id: str) -> Optional[BaseParser]:
        """
        Get a parser instance by ID.

        Args:
            parser_id: ID of the parser to retrieve
            datasource_id: ID of the datasource for this parser instance

        Returns:
            Parser instance or None if not found
        """
        parser_class = cls._parsers.get(parser_id)
        if parser_class is None:
            return None

        return parser_class(datasource_id=datasource_id)

    @classmethod
    def list_parsers(cls) -> Dict[str, str]:
        """
        List all registered parsers.

        Returns:
            Dictionary mapping parser_id to parser_name
        """
        return {
            parser_id: parser_class.parser_name
            for parser_id, parser_class in cls._parsers.items()
        }

    @classmethod
    def is_registered(cls, parser_id: str) -> bool:
        """
        Check if a parser is registered.

        Args:
            parser_id: ID of the parser to check

        Returns:
            True if parser is registered
        """
        return parser_id in cls._parsers


# Register built-in parsers
ParserRegistry.register(NubankExtratoParser)
ParserRegistry.register(NubankFaturaParser)


def get_parser(parser_id: str, datasource_id: str) -> Optional[BaseParser]:
    """
    Convenience function to get a parser instance.

    Args:
        parser_id: ID of the parser to retrieve
        datasource_id: ID of the datasource for this parser instance

    Returns:
        Parser instance or None if not found
    """
    return ParserRegistry.get(parser_id, datasource_id)
