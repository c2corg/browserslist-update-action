import { vi } from 'vitest';
import type { Octokit } from '../src/run.js';

export const httpError = (status: number): Error => Object.assign(new Error(`HTTP ${status}`), { status });

export const fakeOctokit = ({ branchExists = false, openPr = false } = {}) => {
  const octokit = {
    rest: {
      repos: { get: vi.fn().mockResolvedValue({ data: { default_branch: 'main' } }) },
      git: {
        getRef: vi.fn().mockImplementation(() => (branchExists ? Promise.resolve({}) : Promise.reject(httpError(404)))),
        deleteRef: vi.fn().mockResolvedValue({}),
      },
      pulls: {
        list: vi.fn().mockResolvedValue({ data: openPr ? [{ number: 12, node_id: 'PR_12' }] : [] }),
        create: vi.fn().mockResolvedValue({ data: { number: 42, node_id: 'PR_42' } }),
        update: vi.fn().mockResolvedValue({ data: { number: 12, node_id: 'PR_12' } }),
        requestReviewers: vi.fn().mockResolvedValue({}),
      },
      issues: {
        listLabelsForRepo: vi.fn(),
        addLabels: vi.fn().mockResolvedValue({}),
      },
      teams: { list: vi.fn() },
    },
    paginate: vi.fn(),
  };
  octokit.paginate.mockImplementation((method: unknown) => {
    if (method === octokit.rest.issues.listLabelsForRepo) {
      return Promise.resolve([{ name: 'chore' }, { name: 'Dependencies' }]);
    }
    if (method === octokit.rest.teams.list) {
      return Promise.resolve([{ name: 'Front Team', slug: 'front-team' }]);
    }
    return Promise.reject(new Error('unexpected paginate'));
  });
  return octokit;
};
export const asOctokit = (octokit: ReturnType<typeof fakeOctokit>): Octokit => octokit as unknown as Octokit;
