const GITHUB_OWNER = "typesense";
const GITHUB_REPO = "typesense";
const GITHUB_RAW_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
const GITHUB_TREE_API_BASE_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`;

interface GitHubTreeResponse {
  readonly tree: readonly GitHubTreeEntry[];
  readonly truncated?: boolean;
}

interface GitHubTreeEntry {
  readonly path?: string;
  readonly type?: string;
}

export function resolveSourcePath(rootDir: string, filePath: string): string {
  const normalizedRootDir = normalizeRepoPath(rootDir);
  const normalizedFilePath = normalizeRepoPath(filePath);

  if (normalizedFilePath.length === 0) {
    throw new Error("Source file path cannot be empty.");
  }

  if (normalizedFilePath.startsWith("http://") || normalizedFilePath.startsWith("https://")) {
    return normalizedFilePath;
  }

  if (normalizedRootDir.length === 0) {
    return normalizedFilePath;
  }

  return normalizeRepoPath(`${normalizedRootDir}/${normalizedFilePath}`);
}

export function resolveRawGithubUrl(sourceBranch: string, sourcePath: string): string {
  const normalizedSourcePath = normalizeRepoPath(sourcePath);
  if (normalizedSourcePath.length === 0) {
    throw new Error("Source path cannot be empty.");
  }
  return `${GITHUB_RAW_BASE_URL}/${sourceBranch}/${normalizedSourcePath}`;
}

export async function listSourceFiles(
  sourceBranch: string,
  rootDir: string,
  extensions: readonly string[],
): Promise<readonly string[]> {
  const response = await fetch(`${GITHUB_TREE_API_BASE_URL}/${sourceBranch}?recursive=1`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "typesense-api-extractor",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Could not list GitHub source files for ${sourceBranch}: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as GitHubTreeResponse;
  if (payload.truncated === true) {
    throw new Error(`GitHub tree response for ${sourceBranch} was truncated.`);
  }

  const normalizedRootDir = normalizeRepoPath(rootDir);
  const rootPrefix = normalizedRootDir.length === 0 ? "" : `${normalizedRootDir}/`;

  return payload.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
    .filter((filePath): filePath is string => filePath !== undefined)
    .filter((filePath) => rootPrefix.length === 0 || filePath.startsWith(rootPrefix))
    .filter((filePath) => extensions.some((extension) => filePath.endsWith(extension)));
}

function normalizeRepoPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
