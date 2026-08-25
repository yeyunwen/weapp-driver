import { access, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillDirectory = resolve(repository, "skills", "weapp-driver");
const skillPath = resolve(skillDirectory, "SKILL.md");
const openaiPath = resolve(skillDirectory, "agents", "openai.yaml");
const skill = await readFile(skillPath, "utf8");
const openai = await readFile(openaiPath, "utf8");

const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1];
if (!frontmatter) fail("SKILL.md must start with YAML frontmatter");

const fields = Object.fromEntries(
  frontmatter
    .split("\n")
    .map((line) => /^([a-z][a-z0-9_-]*):\s*(.*)$/.exec(line))
    .filter(Boolean)
    .map((match) => [match[1], unquote(match[2])]),
);

for (const field of ["name", "description"]) {
  if (!fields[field]) fail(`SKILL.md frontmatter requires ${field}`);
}
if (fields.name !== basename(skillDirectory)) fail(`Skill name ${fields.name} must match directory ${basename(skillDirectory)}`);
if (!fields.description.includes("Use when")) fail("Skill description must explain when the Skill should be used");
if (!openai.includes(`$${fields.name}`)) fail(`agents/openai.yaml default_prompt must mention $${fields.name}`);

for (const link of skill.matchAll(/\]\((references\/[^)]+)\)/g)) {
  await access(resolve(skillDirectory, link[1])).catch(() => fail(`Missing referenced file: ${link[1]}`));
}

const retiredNames = [
  ["miniapp", "agent"].join("-"),
  ["MINIAPP", "AGENT", "SOCKET"].join("_"),
  ["MINIAPP", "PROJECT"].join("_"),
];
if (retiredNames.some((name) => `${skill}\n${openai}`.includes(name))) fail("Skill contains a retired project name");

process.stdout.write(`Skill is valid: ${skillPath}\n`);

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, "").trim();
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
