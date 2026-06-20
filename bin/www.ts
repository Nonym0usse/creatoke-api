#!/usr/bin/env node

/**
 * Module dependencies.
 */
import http from "node:http";
import createDebug from "debug";
import app from "../app.ts";

const debug = createDebug("creatoke-api:server");

/**
 * Get port from environment and store in Express.
 */
const port = normalizePort(process.env.PORT || "3001");
app.set("port", port);

/**
 * Create HTTP server.
 */
const server = http.createServer(app);

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val: string): number | string | false {
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    // named pipe
    return val;
  }
  if (parsed >= 0) {
    // port number
    return parsed;
  }
  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error: NodeJS.ErrnoException): void {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening(): void {
  const addr = server.address();
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr?.port;
  debug("Listening on " + bind);
  console.log("🚀 creatoke-api listening on " + bind);
}
