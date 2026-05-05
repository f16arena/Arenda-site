import "server-only"

import { readFile } from "fs/promises"
import path from "path"

export type ReleaseInfo = {
  version: string
  commitSha: string | null
  commitShort: string
  branch: string | null
  environment: string
  deploymentUrl: string | null
}

export async function getReleaseInfo(): Promise<ReleaseInfo> {
  const version =
    (await readVersionFile()) ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.APP_VERSION ||
    process.env.npm_package_version ||
    "unknown"

  const commitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_COMMIT_SHA ||
    null

  const branch =
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GITHUB_REF_NAME ||
    process.env.GIT_BRANCH ||
    null

  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null

  return {
    version,
    commitSha,
    commitShort: commitSha ? commitSha.slice(0, 7) : "unknown",
    branch,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    deploymentUrl,
  }
}

async function readVersionFile() {
  return readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "VERSION"), "utf8")
    .then((value) => value.trim())
    .catch(() => null)
}
