import { promises as fs } from "node:fs";
import path from "node:path";

export class SecureFileSystem {
  constructor(private readonly rootDir: string) {}

  private resolveSafePath(targetPath: string): string {
    const normalizedRoot = path.resolve(this.rootDir);
    const resolved = path.resolve(normalizedRoot, targetPath);
    if (!resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
      throw new Error("Path is outside the allowed sandbox root.");
    }
    return resolved;
  }

  async readFile(targetPath: string): Promise<string> {
    return fs.readFile(this.resolveSafePath(targetPath), "utf8");
  }

  async writeFile(targetPath: string, content: string): Promise<void> {
    const resolvedPath = this.resolveSafePath(targetPath);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, content, "utf8");
  }
}
