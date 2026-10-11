// Crée un compte administrateur, ou change son mot de passe s'il existe déjà.
//
//   node scripts/create-admin.ts <email>
//
// Le mot de passe est demandé au clavier (non affiché), ou lu dans la
// variable d'environnement ADMIN_PASSWORD.
import "dotenv/config";
import readline from "node:readline";
import validator from "validator";
import { execute, newId, pool, selectOne } from "../database/mysql.ts";
import { hashPassword } from "../services/auth.ts";

const MIN_LENGTH = 10;

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (text: string) => void; output: NodeJS.WritableStream };
    let muted = false;
    output._writeToOutput = (text: string) => {
      if (!muted) output.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!validator.isEmail(email)) {
  console.error("Usage : node scripts/create-admin.ts <email>");
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD ?? "";
if (!password) {
  password = await askHidden("Mot de passe : ");
  if (password !== (await askHidden("Confirmation : "))) {
    console.error("Les mots de passe ne correspondent pas.");
    process.exit(1);
  }
}
if (password.length < MIN_LENGTH) {
  console.error(`Mot de passe trop court (${MIN_LENGTH} caractères minimum).`);
  process.exit(1);
}

const hash = await hashPassword(password);
const existing = await selectOne("SELECT id FROM admins WHERE email = ?", [email]);
if (existing) {
  await execute("UPDATE admins SET password_hash = ? WHERE id = ?", [hash, existing.id]);
  console.log(`Mot de passe mis à jour pour ${email}.`);
} else {
  await execute("INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)", [newId(), email, hash]);
  console.log(`Compte administrateur créé : ${email}.`);
}
await pool.end();
