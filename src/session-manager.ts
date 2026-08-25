import { stat } from "node:fs/promises";

import type { BackendFactory, MiniSessionBackend } from "./backend.js";
import { pageSummary } from "./backend.js";
import { OwnershipError, SessionBusyError } from "./errors.js";
import { RefRegistry } from "./refs.js";
import type { Ownership, SessionOptions, SessionSummary } from "./types.js";
import { resolveProjectPath } from "./util.js";

export type ManagedSession = {
  projectPath: string;
  backend: MiniSessionBackend;
  registry: RefRegistry;
  ownership: Ownership;
  activeClientId: string | null;
  connectedAt: Date;
  lastUsedAt: Date;
};

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();

  constructor(private readonly factory: BackendFactory) {}

  async use(projectInput: string, options: SessionOptions, clientId: string, force = false) {
    const projectPath = resolveProjectPath(projectInput);
    await assertDirectory(projectPath);
    let session = this.sessions.get(projectPath);
    if (!session) {
      session = {
        projectPath,
        backend: await this.factory.connect(projectPath, options),
        registry: new RefRegistry(),
        ownership: "agent",
        activeClientId: null,
        connectedAt: new Date(),
        lastUsedAt: new Date(),
      };
      this.sessions.set(projectPath, session);
    } else {
      if (session.ownership === "user" && !force) {
        throw new OwnershipError(`The user owns project session ${projectPath}. Call claimProject() only after explicit confirmation.`);
      }
      if (session.activeClientId && session.activeClientId !== clientId) {
        throw new SessionBusyError(`Project session is currently controlled by another agent process: ${projectPath}`);
      }
      try {
        await session.backend.currentPage();
      } catch (error) {
        if (isClosedConnection(error)) {
          await session.backend.close().catch(() => undefined);
          session.backend = await this.factory.connect(projectPath, options);
          session.registry = new RefRegistry();
          session.connectedAt = new Date();
        }
      }
    }
    session.ownership = "agent";
    session.activeClientId = clientId;
    session.lastUsedAt = new Date();
    return this.summary(session);
  }

  require(projectInput: string, clientId: string) {
    const projectPath = resolveProjectPath(projectInput);
    const session = this.sessions.get(projectPath);
    if (!session) throw new Error(`Project session is not connected: ${projectPath}. Call useProject() first.`);
    if (session.ownership === "user") throw new OwnershipError(`The user currently controls project session ${projectPath}.`);
    if (session.activeClientId !== clientId) throw new SessionBusyError(`Client does not own active project session ${projectPath}.`);
    session.lastUsedAt = new Date();
    return session;
  }

  async list(): Promise<SessionSummary[]> {
    return Promise.all([...this.sessions.values()].map((session) => this.summary(session)));
  }

  release(projectInput: string, clientId: string) {
    const session = this.sessions.get(resolveProjectPath(projectInput));
    if (session?.activeClientId === clientId) session.activeClientId = null;
  }

  releaseClient(clientId: string) {
    for (const session of this.sessions.values()) {
      if (session.activeClientId === clientId) session.activeClientId = null;
    }
  }

  handoff(projectInput: string, clientId: string) {
    const session = this.require(projectInput, clientId);
    session.ownership = "user";
    session.activeClientId = null;
    return { done: true, projectPath: session.projectPath, ownership: session.ownership };
  }

  async complete(projectInput: string, clientId: string, keep: boolean) {
    const session = this.require(projectInput, clientId);
    if (keep) {
      session.activeClientId = null;
      return { done: true, kept: true, projectPath: session.projectPath };
    }
    await session.backend.close();
    this.sessions.delete(session.projectPath);
    return { done: true, kept: false, projectPath: session.projectPath };
  }

  async reset(projectInput: string, clientId: string) {
    const projectPath = resolveProjectPath(projectInput);
    const session = this.sessions.get(projectPath);
    if (!session) return { done: true, existed: false, projectPath };
    if (session.activeClientId && session.activeClientId !== clientId) {
      throw new SessionBusyError(`Project session is currently controlled by another agent process: ${projectPath}`);
    }
    await session.backend.close().catch(() => undefined);
    this.sessions.delete(projectPath);
    return { done: true, existed: true, projectPath };
  }

  async closeAll() {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(sessions.map((session) => session.backend.close()));
  }

  private async summary(session: ManagedSession): Promise<SessionSummary> {
    let currentPage = null;
    if (session.ownership === "agent") {
      try {
        currentPage = pageSummary(await session.backend.currentPage());
      } catch {
        currentPage = null;
      }
    }
    return {
      projectPath: session.projectPath,
      ownership: session.ownership,
      connectedAt: session.connectedAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      activeClientId: session.activeClientId,
      currentPage,
    };
  }
}

async function assertDirectory(path: string) {
  const info = await stat(path).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Mini Program project directory does not exist: ${path}`);
}

function isClosedConnection(error: unknown) {
  return /connection closed|websocket|socket hang up|not opened|ECONNRESET/i.test(error instanceof Error ? error.message : String(error));
}
