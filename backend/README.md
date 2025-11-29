# mcp_server_ai

SERVER_PORT=4000
TCP_SERVER_PORT=7000

OPENAI_API_KEY="api key"

KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=my-app
KAFKA_GROUP_ID=my-app-group
SOCKET_EVENT_TO_KAFKA_PREFIX=socket.events   # optional prefix for topics


AI_SERVER_ROOT="../../../../../../aiServer"

OPENAI_MODEL="model"

    // "dev": "kill-port 4000 && docker compose up -d kafka zookeeper redis && nodemon"
