import { lstat, mkdir, readlink, realpath, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillSource = join(repository, "skills", "weapp-driver");
const args = process.argv.slice(2);

if (["-h", "--help"].some((flag) => args.includes(flag))) {
  process.stdout.write(`Install the bundled weapp-driver Skill with a safe symlink.\n\nUsage:\n  node scripts/install-skill.mjs [--target codex|agents|all]\n`);
  process.exit(0);
}

const targetName = valueAfter(args, "--target") || "codex";
if (!["codex", "agents", "all"].includes(targetName)) {
  throw new Error(`Invalid --target ${JSON.stringify(targetName)}; expected codex, agents, or all`);
}

const roots = {
  codex: process.env.CODEX_HOME || join(homedir(), ".codex"),
  agents: process.env.AGENTS_HOME || join(homedir(), ".agents"),
};
const selected = targetName === "all" ? ["codex", "agents"] : [targetName];

for (const name of selected) {
  const target = join(roots[name], "skills", "weapp-driver");
  const status = await installSkillLink(skillSource, target);
  process.stdout.write(`${name}: ${status} ${target} -> ${skillSource}\n`);
}

async function installSkillLink(source, target) {
  await mkdir(dirname(target), { recursive: true });
  try {
    const stat = await lstat(target);
    if (!stat.isSymbolicLink()) {
      throw new Error(`Refusing to replace existing non-symlink: ${target}`);
    }

    const linked = resolve(dirname(target), await readlink(target));
    if ((await realpath(linked)) !== (await realpath(source))) {
      throw new Error(`Refusing to replace existing symlink: ${target} -> ${linked}`);
    }
    return "already linked";
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await symlink(source, target, "dir");
    return "linked";
  }
}

function valueAfter(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : undefined;
}
