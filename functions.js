import fs from "fs";

const progressRegex =
  /\[download\] *(.*) of ([^ ]*)(:? *at *([^ ]*))?(:? *ETA *([^ ]*))?/;

export function getDownloadProgress(stringData) {
  if (stringData[0] !== "[") return;

  const progressMatch = stringData.match(progressRegex);

  if (!progressMatch) return;

  const progressObject = {};

  progressObject.percent = parseInt(progressMatch[1].replace("%", ""));

  return progressObject;
}

export function checkFileExists(file) {
  return fs.promises
    .access(file, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
}
