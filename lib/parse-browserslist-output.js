"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = void 0;
const parse = (output) => {
    let latestVersion = '';
    let installedVersion = '';
    const browsersAdded = [];
    const browsersRemoved = [];
    let isListingChanges = false;
    output.split('\n').forEach((line) => {
        let match;
        if (isListingChanges) {
            match = line.match('([-+])\\s(.*)');
            if (match?.[1] === '+') {
                browsersAdded.push(match[2]);
            }
            else if (match?.[1] === '-') {
                browsersRemoved.push(match[2]);
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
exports.parse = parse;
