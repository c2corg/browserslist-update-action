import stripAnsi from 'strip-ansi';

export type BrowserslistInfo = {
  latestVersion: string;
  installedVersion: string;
  browsersAdded: string[];
  browsersRemoved: string[];
};

export const parse = (output: string): BrowserslistInfo => {
  let latestVersion = '';
  let installedVersion = '';
  const browsersAdded: string[] = [];
  const browsersRemoved: string[] = [];

  let isListingChanges = false;
  for (const line of stripAnsi(output).split('\n')) {
    if (isListingChanges) {
      const match = /^\s*([-+])\s(.*)$/.exec(line);
      if (match?.[1] === '+') {
        browsersAdded.push((match[2] as string).trim());
      } else if (match?.[1] === '-') {
        browsersRemoved.push((match[2] as string).trim());
      }
      continue;
    }
    const latest = /(?:Latest version|Registry latest):\s+(.*)/.exec(line)?.[1];
    if (latest) {
      latestVersion = latest.trim();
      continue;
    }
    const installed = /Installed versions?:\s+(.*)/.exec(line)?.[1];
    if (installed) {
      installedVersion = installed.trim();
      continue;
    }
    if (line.includes('Target browser changes:')) {
      isListingChanges = true;
    }
  }
  return { installedVersion, latestVersion, browsersAdded, browsersRemoved };
};

export const prBody = (browserslistOutput: string): string => {
  const info = parse(browserslistOutput);
  const msg = ['Caniuse database has been updated. Review changes, merge this PR and have a 🍺.'];
  if (info.installedVersion) {
    msg.push(`Installed version: ${info.installedVersion}`);
  }
  if (info.latestVersion) {
    msg.push(`Latest version: ${info.latestVersion}`);
  }
  if (info.browsersAdded.length || info.browsersRemoved.length) {
    msg.push('Target browsers changes:', '', '```diff');
    info.browsersRemoved.forEach((value) => msg.push(`- ${value}`));
    info.browsersAdded.forEach((value) => msg.push(`+ ${value}`));
    msg.push('```');
  }
  return msg.join('\n');
};
