@echo off
chcp 65001 >nul 2>&1
echo ============================================================
echo  NexusText AI v7.0 - Local LLM Mode
echo ============================================================
echo.
echo Starting with Ollama local LLM...
echo.

docker compose -f docker-compose.yml -f docker-compose.local-llm.yml up -d

echo.
echo ============================================================
echo  Services:
echo    Frontend : http://localhost:3002
echo    Backend  : http://localhost:8002
echo    Swagger  : http://localhost:8002/docs
echo    Ollama   : http://localhost:11434
echo ============================================================
echo.
echo To pull a model:
echo   docker exec nexustext-ollama ollama pull llama3.1
echo.
echo To start with vLLM (requires GPU):
echo   docker compose -f docker-compose.yml -f docker-compose.local-llm.yml --profile vllm up -d
echo.
pause
