#!/usr/bin/env python
"""
Script para iniciar workflows do Temporal via Python.
Alternativa ao CLI `temporal workflow start`.
"""

import asyncio
import argparse
import json

from temporalio.client import Client


async def start_train_workflow(client: Client, params: dict):
    """Inicia o TrainWorkflow."""
    from temporal.workflows.train_workflow import TrainWorkflow, TrainWorkflowInput
    
    input_data = TrainWorkflowInput(
        contamination=params.get('contamination', 0.1),
        n_estimators=params.get('n_estimators', 100),
        min_samples=params.get('min_samples', 50),
        force_retrain=params.get('force_retrain', False),
    )
    
    handle = await client.start_workflow(
        TrainWorkflow.run,
        input_data,
        id=f"train-workflow-{asyncio.get_event_loop().time():.0f}",
        task_queue="ml-pipeline",
    )
    
    print(f"✅ TrainWorkflow iniciado!")
    print(f"   Workflow ID: {handle.id}")
    print(f"   Run ID: {handle.result_run_id}")
    return handle


async def start_inference_workflow(client: Client, params: dict):
    """Inicia o InferenceWorkflow."""
    from temporal.workflows.inference_workflow import InferenceWorkflow, InferenceWorkflowInput
    
    input_data = InferenceWorkflowInput(
        batch_size=params.get('batch_size', 100),
        model_name=params.get('model_name', 'anomaly-detector'),
        trigger_dbt=params.get('trigger_dbt', True),
        lookback_hours=params.get('lookback_hours', 24),
    )
    
    handle = await client.start_workflow(
        InferenceWorkflow.run,
        input_data,
        id=f"inference-workflow-{asyncio.get_event_loop().time():.0f}",
        task_queue="ml-pipeline",
    )
    
    print(f"✅ InferenceWorkflow iniciado!")
    print(f"   Workflow ID: {handle.id}")
    print(f"   Run ID: {handle.result_run_id}")
    return handle


async def main():
    parser = argparse.ArgumentParser(description='Start Temporal workflows')
    parser.add_argument('workflow', choices=['train', 'inference'], 
                        help='Workflow to start')
    parser.add_argument('--input', '-i', type=str, default='{}',
                        help='JSON input parameters')
    parser.add_argument('--wait', '-w', action='store_true',
                        help='Wait for workflow completion')
    parser.add_argument('--host', default='localhost:7233',
                        help='Temporal server address')
    
    args = parser.parse_args()
    params = json.loads(args.input)
    
    print(f"🔗 Conectando ao Temporal em {args.host}...")
    client = await Client.connect(args.host)
    
    if args.workflow == 'train':
        handle = await start_train_workflow(client, params)
    else:
        handle = await start_inference_workflow(client, params)
    
    if args.wait:
        print(f"⏳ Aguardando conclusão...")
        result = await handle.result()
        print(f"✅ Workflow concluído!")
        print(f"   Resultado: {result}")


if __name__ == "__main__":
    asyncio.run(main())


