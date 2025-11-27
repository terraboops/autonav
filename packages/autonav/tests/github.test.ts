import { describe, it, expect } from "vitest";
import { parseGitHubUrl, isGitHubUrl } from "../src/pack-installer/github.js";

describe("GitHub URL parsing", () => {
  describe("isGitHubUrl", () => {
    it("returns true for github: shorthand", () => {
      expect(isGitHubUrl("github:owner/repo/path")).toBe(true);
    });

    it("returns true for https://github.com URLs", () => {
      expect(isGitHubUrl("https://github.com/owner/repo/tree/main/path")).toBe(true);
    });

    it("returns true for SSH URLs", () => {
      expect(isGitHubUrl("git@github.com:owner/repo")).toBe(true);
      expect(isGitHubUrl("git@github.com:owner/repo/path")).toBe(true);
    });

    it("returns false for non-GitHub URLs", () => {
      expect(isGitHubUrl("https://example.com/path")).toBe(false);
      expect(isGitHubUrl("platform-engineering")).toBe(false);
    });
  });

  describe("parseGitHubUrl", () => {
    describe("github: shorthand", () => {
      it("parses basic owner/repo", () => {
        const result = parseGitHubUrl("github:owner/repo");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "main",
          path: "",
          useSsh: false,
        });
      });

      it("parses owner/repo with path", () => {
        const result = parseGitHubUrl("github:owner/repo/packs/my-pack");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "main",
          path: "packs/my-pack",
          useSsh: false,
        });
      });

      it("parses owner/repo with @version", () => {
        const result = parseGitHubUrl("github:owner/repo/path@v1.0.0");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "v1.0.0",
          path: "path",
          useSsh: false,
        });
      });

      it("handles nested paths with version", () => {
        const result = parseGitHubUrl("github:org/project/packs/platform-engineering@develop");
        expect(result).toEqual({
          owner: "org",
          repo: "project",
          ref: "develop",
          path: "packs/platform-engineering",
          useSsh: false,
        });
      });

      it("returns null for invalid shorthand", () => {
        expect(parseGitHubUrl("github:")).toBe(null);
        expect(parseGitHubUrl("github:owner")).toBe(null);
      });
    });

    describe("SSH URLs", () => {
      it("parses basic SSH URL", () => {
        const result = parseGitHubUrl("git@github.com:owner/repo");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "main",
          path: "",
          useSsh: true,
        });
      });

      it("parses SSH URL with .git suffix", () => {
        const result = parseGitHubUrl("git@github.com:owner/repo.git");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "main",
          path: "",
          useSsh: true,
        });
      });

      it("parses SSH URL with path", () => {
        const result = parseGitHubUrl("git@github.com:owner/repo/packs/my-pack");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "main",
          path: "packs/my-pack",
          useSsh: true,
        });
      });

      it("parses SSH URL with @version", () => {
        const result = parseGitHubUrl("git@github.com:owner/repo/path@v1.0.0");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "v1.0.0",
          path: "path",
          useSsh: true,
        });
      });

      it("handles nested paths with version", () => {
        const result = parseGitHubUrl("git@github.com:terraboops/platform-ai/packs/platform-engineering@main");
        expect(result).toEqual({
          owner: "terraboops",
          repo: "platform-ai",
          ref: "main",
          path: "packs/platform-engineering",
          useSsh: true,
        });
      });
    });

    describe("full GitHub URLs", () => {
      it("parses tree URL with path", () => {
        const result = parseGitHubUrl("https://github.com/owner/repo/tree/main/packs/my-pack");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "main",
          path: "packs/my-pack",
          useSsh: false,
        });
      });

      it("parses tree URL without path (branch root)", () => {
        const result = parseGitHubUrl("https://github.com/owner/repo/tree/main");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "main",
          path: "",
          useSsh: false,
        });
      });

      it("parses tree URL with tag ref", () => {
        const result = parseGitHubUrl("https://github.com/owner/repo/tree/v1.2.3/path");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "v1.2.3",
          path: "path",
          useSsh: false,
        });
      });

      it("parses repo root URL", () => {
        const result = parseGitHubUrl("https://github.com/owner/repo");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "main",
          path: "",
          useSsh: false,
        });
      });

      it("parses repo root URL with trailing slash", () => {
        const result = parseGitHubUrl("https://github.com/owner/repo/");
        expect(result).toEqual({
          owner: "owner",
          repo: "repo",
          ref: "main",
          path: "",
          useSsh: false,
        });
      });

      it("returns null for non-GitHub URLs", () => {
        expect(parseGitHubUrl("https://example.com/owner/repo")).toBe(null);
        expect(parseGitHubUrl("platform-engineering")).toBe(null);
      });
    });
  });
});
