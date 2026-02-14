###############################################################################
# NexusText AI v7.0 - LLM メトリクスダッシュボード & アラーム
###############################################################################

# ---------------------------------------------------------------------------
# LLMメトリクス用カスタム名前空間ダッシュボード
# OpenTelemetry → CloudWatch Metrics 連携で収集されるメトリクスを可視化
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "llm_metrics" {
  dashboard_name = "${var.cluster_name}-llm-metrics"

  dashboard_body = jsonencode({
    widgets = [
      # LLMリクエスト数（モデル別）
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["NexusText/LLM", "RequestCount", "Model", "claude-opus-4-6", { stat = "Sum" }],
            ["NexusText/LLM", "RequestCount", "Model", "claude-sonnet-4-5", { stat = "Sum" }],
            ["NexusText/LLM", "RequestCount", "Model", "gpt-5.2", { stat = "Sum" }],
            ["NexusText/LLM", "RequestCount", "Model", "gemini-3.0-pro", { stat = "Sum" }]
          ]
          period = 300
          region = var.region
          title  = "LLM Requests by Model"
          view   = "timeSeries"
        }
      },
      # LLMレイテンシ（モデル別P50/P95）
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["NexusText/LLM", "LatencyMs", "Model", "claude-opus-4-6", { stat = "p50" }],
            ["NexusText/LLM", "LatencyMs", "Model", "claude-opus-4-6", { stat = "p95" }],
            ["NexusText/LLM", "LatencyMs", "Model", "claude-sonnet-4-5", { stat = "p50" }],
            ["NexusText/LLM", "LatencyMs", "Model", "claude-sonnet-4-5", { stat = "p95" }]
          ]
          period = 300
          region = var.region
          title  = "LLM Latency (P50 / P95)"
          view   = "timeSeries"
          yAxis = {
            left = { label = "ms" }
          }
        }
      },
      # トークン消費量
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["NexusText/LLM", "InputTokens", "Provider", "direct", { stat = "Sum" }],
            ["NexusText/LLM", "OutputTokens", "Provider", "direct", { stat = "Sum" }],
            ["NexusText/LLM", "InputTokens", "Provider", "aws_bedrock", { stat = "Sum" }],
            ["NexusText/LLM", "OutputTokens", "Provider", "aws_bedrock", { stat = "Sum" }]
          ]
          period = 3600
          region = var.region
          title  = "Token Consumption by Provider"
          view   = "timeSeries"
        }
      },
      # LLMエラー率
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["NexusText/LLM", "ErrorCount", "Provider", "direct", { stat = "Sum" }],
            ["NexusText/LLM", "ErrorCount", "Provider", "aws_bedrock", { stat = "Sum" }],
            ["NexusText/LLM", "ErrorCount", "Provider", "azure_ai_foundry", { stat = "Sum" }],
            ["NexusText/LLM", "ErrorCount", "Provider", "gcp_vertex_ai", { stat = "Sum" }]
          ]
          period = 300
          region = var.region
          title  = "LLM Errors by Provider"
          view   = "timeSeries"
        }
      },
      # デプロイメントモード・プロバイダー情報
      {
        type   = "text"
        x      = 0
        y      = 12
        width  = 24
        height = 2
        properties = {
          markdown = "## LLM Provider Configuration\n| Setting | Description |\n|---------|-------------|\n| `NEXUSTEXT_LLM_DEPLOYMENT_MODE` | direct / aws_bedrock / azure_ai_foundry / gcp_vertex_ai / local |\n| Circuit Breaker | Auto-switch after 3 consecutive failures, half-open retry after 60s |"
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# LLMエラー率アラーム（10%超過で通知）
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "llm_error_rate" {
  alarm_name          = "${var.cluster_name}-llm-high-error-rate"
  alarm_description   = "LLM error rate exceeds 10%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 10

  metric_query {
    id          = "error_rate"
    expression  = "(errors / total) * 100"
    label       = "LLM Error Rate %"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      metric_name = "ErrorCount"
      namespace   = "NexusText/LLM"
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "total"
    metric {
      metric_name = "RequestCount"
      namespace   = "NexusText/LLM"
      period      = 300
      stat        = "Sum"
    }
  }

  treat_missing_data = "notBreaching"
  alarm_actions      = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []
  ok_actions         = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  tags = {
    Name      = "${var.cluster_name}-llm-error-alarm"
    Component = "monitoring"
  }
}

# ---------------------------------------------------------------------------
# LLMレイテンシアラーム（P95 30秒超過で通知）
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "llm_high_latency" {
  alarm_name          = "${var.cluster_name}-llm-high-latency"
  alarm_description   = "LLM P95 latency exceeds 30 seconds"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "LatencyMs"
  namespace           = "NexusText/LLM"
  period              = 300
  extended_statistic  = "p95"
  threshold           = 30000
  treat_missing_data  = "notBreaching"

  alarm_actions = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  tags = {
    Name      = "${var.cluster_name}-llm-latency-alarm"
    Component = "monitoring"
  }
}
