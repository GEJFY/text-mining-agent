"""OpenTelemetry統合

TracerProvider, MeterProviderの初期化とカスタムLLMメトリクスを提供。
OTEL_EXPORTER_OTLP_ENDPOINT が未設定の場合はNoOpエクスポーターで動作。
"""

import os

from app.core.logging import get_logger

logger = get_logger(__name__)


def setup_telemetry(app: object) -> None:
    """OpenTelemetryの初期化（FastAPIアプリに計装を追加）

    環境変数 OTEL_EXPORTER_OTLP_ENDPOINT が設定されている場合のみ
    OTLPエクスポーターを有効化。未設定時はインメモリのNoOpで動作。
    """
    try:
        from opentelemetry import metrics, trace
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider

        resource = Resource.create(
            {
                "service.name": "nexustext-ai",
                "service.version": "7.0.0",
            }
        )

        # TracerProvider
        tracer_provider = TracerProvider(resource=resource)
        otlp_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
        if otlp_endpoint:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
                OTLPSpanExporter,
            )
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint)))
        trace.set_tracer_provider(tracer_provider)

        # MeterProvider
        meter_provider = MeterProvider(resource=resource)
        if otlp_endpoint:
            from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
                OTLPMetricExporter,
            )
            from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

            meter_provider = MeterProvider(
                resource=resource,
                metric_readers=[
                    PeriodicExportingMetricReader(
                        OTLPMetricExporter(endpoint=otlp_endpoint),
                        export_interval_millis=30000,
                    )
                ],
            )
        metrics.set_meter_provider(meter_provider)

        # FastAPI自動計装
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

            FastAPIInstrumentor.instrument_app(app)
            logger.info("otel_fastapi_instrumented")
        except Exception:
            logger.debug("otel_fastapi_instrumentation_skipped")

        # httpx自動計装
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

            HTTPXClientInstrumentor().instrument()
            logger.info("otel_httpx_instrumented")
        except Exception:
            logger.debug("otel_httpx_instrumentation_skipped")

        logger.info("otel_initialized", otlp_endpoint=otlp_endpoint or "none")

    except ImportError:
        logger.info("otel_not_available")
    except Exception as e:
        logger.warning("otel_init_failed", error=str(e))


# カスタムLLMメトリクス（遅延初期化）
_llm_meter = None


def get_llm_meter():
    """LLMメトリクス用Meterを取得"""
    global _llm_meter
    if _llm_meter is None:
        try:
            from opentelemetry import metrics

            _llm_meter = metrics.get_meter("nexustext.llm", "7.0.0")
        except Exception:
            return None
    return _llm_meter


def record_llm_request(*, model: str, provider: str, latency_ms: float, success: bool, tokens: int = 0) -> None:
    """LLMリクエストのメトリクスを記録"""
    meter = get_llm_meter()
    if meter is None:
        return

    try:
        attrs = {"model": model, "provider": provider, "success": str(success)}

        counter = meter.create_counter("llm.requests.total", description="Total LLM requests")
        counter.add(1, attrs)

        histogram = meter.create_histogram("llm.request.duration_ms", description="LLM request latency", unit="ms")
        histogram.record(latency_ms, attrs)

        if tokens > 0:
            token_counter = meter.create_counter("llm.tokens.total", description="Total tokens consumed")
            token_counter.add(tokens, attrs)

        if not success:
            err_counter = meter.create_counter("llm.errors.total", description="Total LLM errors")
            err_counter.add(1, attrs)
    except Exception:
        pass
