export interface PullRequestFile {
  filename: string;

  status:
    | "added"
    | "modified"
    | "deleted"
    | "renamed";

  additions: number;

  deletions: number;

  changes: number;

  patch?: string;
}

export interface PullRequestContext {
  owner: string;

  repo: string;

  number: number;

  title: string;

  body?: string;

  baseSha: string;

  headSha: string;

  files: PullRequestFile[];
}