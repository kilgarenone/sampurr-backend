import { promises as fs } from "fs";
import path from "path";

const __dirname = path.resolve();
const tmpPath = path.join(__dirname, "/tmp");

async function dirSize(directory) {
  const files = await fs.readdir(directory);
  const stats = await Promise.all(
    files.map((file) => fs.stat(path.join(directory, file)))
  );

  return stats.reduce((accumulator, { size }) => accumulator + size, 0);
}

// source: https://stackoverflow.com/a/18650828/73323
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

try {
  const size = await dirSize(tmpPath);
  console.log("total size of tmp directory", formatBytes(size));
} catch (error) {
  console.error("error in when calcualting total directory size", error);
}

async function removeFileBasedOnFileAge(directory) {
  const now = new Date().getTime();
  console.log("now:", now);

  const files = await fs.readdir(directory);

  const stats = files.map(async (file) => {
    const filePath = path.join(directory, file);

    const { mtime } = await fs.stat(filePath);

    let endTime = new Date(mtime).getTime(); // 5 days in miliseconds
    console.log("endTime:", endTime);

    console.log("endTime2:", endTime + 432000000);

    // if (now > endTime) {
    //   return fs.unlink(filePath);
    // }

    return;
  });

  return Promise.all(stats);
}
// if (size > 1073741824) {
await removeFileBasedOnFileAge(tmpPath);
// }
