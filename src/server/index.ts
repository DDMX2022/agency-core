import { buildServer } from "./app.js";

const PORT = parseInt(process.env["PORT"] ?? "3100", 10);
const HOST = process.env["HOST"] ?? "0.0.0.0";

async function main(): Promise<void> {
  const server = buildServer();

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`🚀 AgencyCore server running on http://${HOST}:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   POST /run to execute the pipeline`);
    console.log(`   POST /integrations/openclaw/message`);
    console.log(`   POST /products/scaffold`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
