"""
Ingest Workflow - Temporal workflow for processing CSV uploads

This workflow orchestrates the ingestion of CSV files:
1. Parse the CSV using the appropriate parser
2. Insert transactions with deduplication
3. Run dbt to refresh bronze/silver/gold layers
"""

from datetime import timedelta
from dataclasses import dataclass
from typing import Optional, List
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from temporal.worker.activities import (
        ParseCSVInput,
        ParseCSVOutput,
        InsertTransactionsInput,
        InsertTransactionsOutput,
        RunDbtInput,
        RunDbtOutput,
        UpdateUploadStatusInput,
        parse_csv_activity,
        insert_transactions_activity,
        run_dbt_activity,
        update_upload_status_activity,
    )


@dataclass
class IngestWorkflowInput:
    """Input for the ingest workflow"""

    upload_id: int
    file_path: str
    datasource_id: str
    parser_id: str


@dataclass
class IngestWorkflowOutput:
    """Output from the ingest workflow"""

    success: bool
    upload_id: int
    total_rows: int
    inserted_rows: int
    duplicated_rows: int
    error_rows: int
    errors: List[str]
    dbt_success: bool


@workflow.defn
class IngestWorkflow:
    """
    Workflow for ingesting CSV files from financial institutions.

    Steps:
    1. Update upload status to "processing"
    2. Parse CSV file using the appropriate parser
    3. Insert transactions with deduplication
    4. Run dbt to refresh data models
    5. Update upload status to "completed" or "failed"
    """

    @workflow.run
    async def run(self, input: IngestWorkflowInput) -> IngestWorkflowOutput:
        """Execute the ingest workflow"""

        # Step 1: Update status to processing
        await workflow.execute_activity(
            update_upload_status_activity,
            UpdateUploadStatusInput(
                upload_id=input.upload_id,
                status="processing",
            ),
            start_to_close_timeout=timedelta(seconds=30),
        )

        try:
            # Step 2: Parse CSV
            parse_result: ParseCSVOutput = await workflow.execute_activity(
                parse_csv_activity,
                ParseCSVInput(
                    file_path=input.file_path,
                    datasource_id=input.datasource_id,
                    parser_id=input.parser_id,
                ),
                start_to_close_timeout=timedelta(minutes=5),
            )

            if not parse_result.success:
                # Update status to failed
                await workflow.execute_activity(
                    update_upload_status_activity,
                    UpdateUploadStatusInput(
                        upload_id=input.upload_id,
                        status="failed",
                        error="; ".join(parse_result.errors[:5]),
                        total_rows=parse_result.total_rows,
                        error_rows=parse_result.error_rows,
                    ),
                    start_to_close_timeout=timedelta(seconds=30),
                )

                return IngestWorkflowOutput(
                    success=False,
                    upload_id=input.upload_id,
                    total_rows=parse_result.total_rows,
                    inserted_rows=0,
                    duplicated_rows=0,
                    error_rows=parse_result.error_rows,
                    errors=parse_result.errors,
                    dbt_success=False,
                )

            # Step 3: Insert transactions with deduplication
            insert_result: InsertTransactionsOutput = await workflow.execute_activity(
                insert_transactions_activity,
                InsertTransactionsInput(
                    transactions=parse_result.transactions,
                    upload_id=input.upload_id,
                ),
                start_to_close_timeout=timedelta(minutes=10),
            )

            # Step 4: Run dbt (only if we inserted new rows)
            dbt_success = True
            if insert_result.inserted_count > 0:
                dbt_result: RunDbtOutput = await workflow.execute_activity(
                    run_dbt_activity,
                    RunDbtInput(
                        models=["bronze", "silver"],  # Refresh bronze and silver
                    ),
                    start_to_close_timeout=timedelta(minutes=15),
                )
                dbt_success = dbt_result.success

            # Step 5: Update status to completed
            await workflow.execute_activity(
                update_upload_status_activity,
                UpdateUploadStatusInput(
                    upload_id=input.upload_id,
                    status="completed",
                    total_rows=parse_result.total_rows,
                    inserted_rows=insert_result.inserted_count,
                    duplicated_rows=insert_result.duplicated_count,
                    error_rows=parse_result.error_rows,
                    periodo_inicio=parse_result.periodo_inicio,
                    periodo_fim=parse_result.periodo_fim,
                ),
                start_to_close_timeout=timedelta(seconds=30),
            )

            return IngestWorkflowOutput(
                success=True,
                upload_id=input.upload_id,
                total_rows=parse_result.total_rows,
                inserted_rows=insert_result.inserted_count,
                duplicated_rows=insert_result.duplicated_count,
                error_rows=parse_result.error_rows,
                errors=parse_result.errors,
                dbt_success=dbt_success,
            )

        except Exception as e:
            # Update status to failed
            await workflow.execute_activity(
                update_upload_status_activity,
                UpdateUploadStatusInput(
                    upload_id=input.upload_id,
                    status="failed",
                    error=str(e),
                ),
                start_to_close_timeout=timedelta(seconds=30),
            )

            raise
