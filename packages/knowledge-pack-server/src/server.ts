import express, { Request, Response } from "express";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  createErrorResponse,
  isValidPackName,
  isValidVersion,
  getLatestVersion,
  VersionsResponse,
  ErrorResponse,
  PackMetadata,
  PackMetadataSchema,
} from "./schemas.js";

/**
 * Reference HTTP server for Knowledge Pack Protocol
 *
 * Implements the v1.0.0 protocol specification:
 * - GET /packs/{pack-name}/latest
 * - GET /packs/{pack-name}/versions
 * - GET /packs/{pack-name}/{version}
 * - GET /packs/{pack-name}/metadata (optional)
 */
export class KnowledgePackServer {
  private app: express.Application;
  private packsDir: string;

  constructor(packsDir: string = "./packs") {
    this.app = express();
    this.packsDir = packsDir;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", (_req, res) => {
      res.json({ status: "ok", protocol: "knowledge-pack/1.0.0" });
    });

    // Get latest version
    this.app.get("/packs/:packName/latest", (req, res) => {
      this.handleLatest(req, res);
    });

    // List versions
    this.app.get("/packs/:packName/versions", (req, res) => {
      this.handleVersions(req, res);
    });

    // Get metadata for latest version
    this.app.get("/packs/:packName/metadata", (req, res) => {
      this.handleMetadata(req, res);
    });

    // Get specific version
    this.app.get("/packs/:packName/:version", (req, res) => {
      this.handleSpecificVersion(req, res);
    });

    // 404 handler
    this.app.use((_req, res) => {
      this.sendError(res, 404, "PACK_NOT_FOUND", "Endpoint not found");
    });
  }

  /**
   * Handle GET /packs/{pack-name}/latest
   */
  private handleLatest(req: Request, res: Response): void {
    const packName = req.params.packName;
    if (!packName) {
      return this.sendError(res, 400, "INVALID_PACK_NAME", "Pack name is required");
    }

    if (!isValidPackName(packName)) {
      return this.sendError(
        res,
        400,
        "INVALID_PACK_NAME",
        `Invalid pack name: ${packName}`,
        packName
      );
    }

    const packDir = join(this.packsDir, packName);
    if (!existsSync(packDir)) {
      return this.sendError(
        res,
        404,
        "PACK_NOT_FOUND",
        `Pack '${packName}' not found`,
        packName
      );
    }

    const versions = this.getAvailableVersions(packName);
    if (versions.length === 0) {
      return this.sendError(
        res,
        404,
        "VERSION_NOT_FOUND",
        `No versions available for pack '${packName}'`,
        packName
      );
    }

    const latestVersion = getLatestVersion(versions);
    if (!latestVersion) {
      return this.sendError(
        res,
        500,
        "SERVER_ERROR",
        "Failed to determine latest version",
        packName
      );
    }

    this.servePack(res, packName, latestVersion);
  }

  /**
   * Handle GET /packs/{pack-name}/versions
   */
  private handleVersions(req: Request, res: Response): void {
    const packName = req.params.packName;
    if (!packName) {
      return this.sendError(res, 400, "INVALID_PACK_NAME", "Pack name is required");
    }

    if (!isValidPackName(packName)) {
      return this.sendError(
        res,
        400,
        "INVALID_PACK_NAME",
        `Invalid pack name: ${packName}`,
        packName
      );
    }

    const packDir = join(this.packsDir, packName);
    if (!existsSync(packDir)) {
      return this.sendError(
        res,
        404,
        "PACK_NOT_FOUND",
        `Pack '${packName}' not found`,
        packName
      );
    }

    const versions = this.getAvailableVersions(packName);
    const versionInfos = versions
      .map((version) => {
        const metadata = this.loadMetadata(packName, version);
        const tarballPath = join(
          packDir,
          version,
          `${packName}-${version}.tar.gz`
        );
        const size = existsSync(tarballPath)
          ? statSync(tarballPath).size
          : 0;

        return {
          version,
          released: metadata?.updated || new Date().toISOString(),
          size,
          autonav_version: metadata?.autonav_version,
          description: metadata?.description,
        };
      })
      .sort((a, b) => {
        // Sort by version descending (newest first)
        const [aMajor, aMinor, aPatch] = a.version.split(".").map(Number);
        const [bMajor, bMinor, bPatch] = b.version.split(".").map(Number);
        if (bMajor !== undefined && aMajor !== undefined && bMajor !== aMajor) return bMajor - aMajor;
        if (bMinor !== undefined && aMinor !== undefined && bMinor !== aMinor) return bMinor - aMinor;
        if (bPatch !== undefined && aPatch !== undefined) return bPatch - aPatch;
        return 0;
      });

    const response: VersionsResponse = {
      pack: packName,
      versions: versionInfos,
    };

    res.json(response);
  }

  /**
   * Handle GET /packs/{pack-name}/metadata
   */
  private handleMetadata(req: Request, res: Response): void {
    const packName = req.params.packName;
    if (!packName) {
      return this.sendError(res, 400, "INVALID_PACK_NAME", "Pack name is required");
    }

    if (!isValidPackName(packName)) {
      return this.sendError(
        res,
        400,
        "INVALID_PACK_NAME",
        `Invalid pack name: ${packName}`,
        packName
      );
    }

    const versions = this.getAvailableVersions(packName);
    if (versions.length === 0) {
      return this.sendError(
        res,
        404,
        "PACK_NOT_FOUND",
        `Pack '${packName}' not found`,
        packName
      );
    }

    const latestVersion = getLatestVersion(versions);
    if (!latestVersion) {
      return this.sendError(
        res,
        500,
        "SERVER_ERROR",
        "Failed to determine latest version",
        packName
      );
    }

    const metadata = this.loadMetadata(packName, latestVersion);
    if (!metadata) {
      return this.sendError(
        res,
        500,
        "SERVER_ERROR",
        "Failed to load metadata",
        packName,
        latestVersion
      );
    }

    res.json(metadata);
  }

  /**
   * Handle GET /packs/{pack-name}/{version}
   */
  private handleSpecificVersion(req: Request, res: Response): void {
    const packName = req.params.packName;
    const version = req.params.version;

    if (!packName) {
      return this.sendError(res, 400, "INVALID_PACK_NAME", "Pack name is required");
    }

    if (!version) {
      return this.sendError(res, 400, "INVALID_VERSION", "Version is required");
    }

    if (!isValidPackName(packName)) {
      return this.sendError(
        res,
        400,
        "INVALID_PACK_NAME",
        `Invalid pack name: ${packName}`,
        packName
      );
    }

    if (!isValidVersion(version)) {
      return this.sendError(
        res,
        400,
        "INVALID_VERSION",
        `Invalid version format: ${version}. Use semantic version like '1.0.0' or use /latest endpoint`,
        packName,
        version
      );
    }

    const packDir = join(this.packsDir, packName);
    if (!existsSync(packDir)) {
      return this.sendError(
        res,
        404,
        "PACK_NOT_FOUND",
        `Pack '${packName}' not found`,
        packName
      );
    }

    const versions = this.getAvailableVersions(packName);
    if (!versions.includes(version)) {
      return this.sendError(
        res,
        404,
        "VERSION_NOT_FOUND",
        `Version '${version}' not found for pack '${packName}'`,
        packName,
        version,
        versions
      );
    }

    this.servePack(res, packName, version);
  }

  /**
   * Serve a pack tarball
   */
  private servePack(res: Response, packName: string, version: string): void {
    const tarballPath = join(
      this.packsDir,
      packName,
      version,
      `${packName}-${version}.tar.gz`
    );

    if (!existsSync(tarballPath)) {
      return this.sendError(
        res,
        500,
        "SERVER_ERROR",
        `Tarball not found for ${packName}@${version}`,
        packName,
        version
      );
    }

    res.setHeader("Content-Type", "application/gzip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${packName}-${version}.tar.gz"`
    );
    res.setHeader("X-Pack-Name", packName);
    res.setHeader("X-Pack-Version", version);

    // Use absolute path
    const absolutePath = tarballPath.startsWith('/') ? tarballPath : join(process.cwd(), tarballPath);
    res.sendFile(absolutePath);
  }

  /**
   * Get available versions for a pack
   */
  private getAvailableVersions(packName: string): string[] {
    const packDir = join(this.packsDir, packName);
    if (!existsSync(packDir)) return [];

    return readdirSync(packDir)
      .filter((dir) => {
        const fullPath = join(packDir, dir);
        return statSync(fullPath).isDirectory() && isValidVersion(dir);
      })
      .sort()
      .reverse();
  }

  /**
   * Load metadata for a specific pack version
   */
  private loadMetadata(
    packName: string,
    version: string
  ): PackMetadata | null {
    const metadataPath = join(
      this.packsDir,
      packName,
      version,
      "metadata.json"
    );

    if (!existsSync(metadataPath)) {
      return null;
    }

    try {
      const raw = readFileSync(metadataPath, "utf-8");
      const data = JSON.parse(raw);
      return PackMetadataSchema.parse(data);
    } catch (error) {
      console.error(`Failed to load metadata for ${packName}@${version}:`, error);
      return null;
    }
  }

  /**
   * Send error response
   */
  private sendError(
    res: Response,
    status: number,
    code: ErrorResponse["code"],
    message: string,
    pack?: string,
    version?: string,
    availableVersions?: string[]
  ): void {
    const error = createErrorResponse(code, message, pack, version, availableVersions);
    res.status(status).json(error);
  }

  /**
   * Start the server
   */
  public listen(port: number, callback?: () => void): void {
    this.app.listen(port, callback);
  }

  /**
   * Get the Express app instance
   */
  public getApp(): express.Application {
    return this.app;
  }
}
