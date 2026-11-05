import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { readFile, writeFile } from "node:fs/promises";
import { hashPassword } from "../server/auth.js";

if (!process.stdin.isTTY)
  throw new Error("Run npm run auth:setup in an interactive terminal.");
let hidden = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!hidden) process.stdout.write(chunk, encoding);
    done();
  },
});
const prompt = createInterface({
  input: process.stdin,
  output,
  terminal: true,
});
try {
  const username = (await prompt.question("Dashboard username: ")).trim();
  if (!/^[\w.@-]{1,128}$/.test(username))
    throw new Error(
      "Use letters, numbers, dots, @, underscores, or hyphens for the username.",
    );
  process.stdout.write(
    "Dashboard password (at least 16 characters; input hidden): ",
  );
  hidden = true;
  const password = await prompt.question("");
  process.stdout.write("\nConfirm password: ");
  const confirmation = await prompt.question("");
  hidden = false;
  process.stdout.write("\n");
  if (password !== confirmation)
    throw new Error("Passwords do not match. No configuration was changed.");
  const passwordHash = await hashPassword(password);
  let text = await readFile(".env", "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  text = text.replace(
    /^APP_(?:USERNAME|PASSWORD|PASSWORD_HASH)=.*\r?\n?/gm,
    "",
  );
  await writeFile(
    ".env",
    text.trimEnd() +
      `\nAPP_USERNAME=${username}\nAPP_PASSWORD_HASH=${passwordHash}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Dashboard account saved in .env as a salted password hash. Restart the server to apply it.",
  );
} finally {
  hidden = false;
  prompt.close();
}
