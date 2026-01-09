import { initSqlJs } from './utils/sqljs-wrapper.js';

/*
IMPORTANT: 
This file requires the sql-wasm.wasm file to be present in the src/libs/ directory.
Please download it from https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.wasm 
and place it in src/libs/sql.wasm
*/



export let db = null;

export async function connect(dbPath) {
  console.log('db_sqlite.js: connect function called. initSqlJs:', initSqlJs);
  const SQL = await initSqlJs({
    locateFile: file => `./libs/${file}`
  });
  
  try {
    const response = await fetch(dbPath);
    const buffer = await response.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buffer));
  } catch (error) {
    console.error("Failed to load database:", error);
    // Create a new database if it doesn't exist
    db = new SQL.Database();
  }
}

function get(query, params = []) {
  const stmt = db.prepare(query);
  stmt.bind(params);
  const result = stmt.get();
  stmt.free();
  return result;
}

function getAll(query, params = []) {
  const stmt = db.prepare(query);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function run(query, params = []) {
  db.run(query, params);
}

export { get, getAll, run };
