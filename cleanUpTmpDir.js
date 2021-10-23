import { promises as fs } from "fs";
import path from "path";

const __dirname = path.resolve();
const tmpPath = path.join(__dirname, "/tmp");

// source: https://stackoverflow.com/a/18650828/73323
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

async function dirSize(directory) {
  const files = await fs.readdir(directory);
  const stats = await Promise.all(
    files.map((file) => fs.stat(path.join(directory, file)))
  );

  return stats.reduce((accumulator, { size }) => accumulator + size, 0);
}

async function removeFileBasedOnFileAge(directory) {
  const now = new Date().getTime();

  const files = await fs.readdir(directory);

  const stats = files.map(async (file) => {
    const filePath = path.join(directory, file);

    const { birthtimeMs } = await fs.stat(filePath);

    // only delete files that are 10 days old (fact: 1 day in millisecond is 86400000)
    const endTime = birthtimeMs + 10 * 86400000;

    if (now > endTime) {
      return fs.unlink(filePath);
    }

    return;
  });

  return Promise.all(stats);
}

try {
  const size = await dirSize(tmpPath);
  console.log("total size of tmp directory", formatBytes(size));
  // clean up if occupied space is more than 1GB
  if (size > 1073741824) {
    await removeFileBasedOnFileAge(tmpPath);
  }
} catch (error) {
  console.error("error during clean up", error);
}
