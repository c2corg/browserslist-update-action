import stripAnsi from 'strip-ansi';

export type BrowserslistInfo = {
  latestVersion: string;
  installedVersion: string;
  browsersAdded: string[];
  browsersRemoved: string[];
};

export const parse = async (output: string): Promise<BrowserslistInfo> => {
  let latestVersion = '';
  let installedVersion = '';
  const browsersAdded: string[] = [];
  const browsersRemoved: string[] = [];

  let isListingChanges = false;
  stripAnsi(output)
    .split('\n')
    .forEach((line) => {
      let match: string[] | null;
      if (isListingChanges) {
        match = line.match('([-+])\\s(.*)');
        if (match?.[1] === '+') {
          browsersAdded.push(match[2] as string);
        } else if (match?.[1] === '-') {
          browsersRemoved.push(match[2] as string);
        }
        return;
      }
      match = line.match('Latest version:\\s+(.*)');
      if (match?.[1]) {
        latestVersion = match?.[1];
        return;
      }
      match = line.match('Installed version:\\s+(.*)');
      if (match?.[1]) {
        installedVersion = match?.[1];
        return;
      }
      if (line.match('Target browser changes:')) {
        isListingChanges = true;
      }
    });
  return {
    installedVersion,
    latestVersion,
    browsersAdded,
    browsersRemoved,
  };
};
