const express = require("express");
const cors = require("cors");
const createError = require("http-errors");
const fs = require("fs");
const path = require("path");
const execa = require("execa");
const readline = require("readline");

const app = express();

const isProduction = app.get("env") === "production";

if (isProduction) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");

app.set("port", process.env.PORT || 4000);

// app.use(
//   express.urlencoded({
//     extended: true,
//   })
// );
app.use(express.json());

app.use(express.static("tmp"));

// url of your client
const ALLOWED_ORIGINS = [
  "http://localhost:8080" /* "https://example-prod-app.com */,
];

app.use(
  cors({
    credentials: true, // include Access-Control-Allow-Credentials: true. remember set xhr.withCredentials = true;
    origin(origin, callback) {
      // allow requests with no origin
      // (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not " +
          "allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);

app.get("/download", async (req, res) => {
  let { start, end, title } = req.query;

  res.setHeader("Content-disposition", `attachment; filename=${title}.wav`);
  res.setHeader("Content-type", "audio/wav");

  const ffmpeg = execa("ffmpeg", [
    "-i",
    "tmp/bamxPYj0O9M.wav",
    "-ss",
    start,
    "-to",
    end,
    "-f",
    "wav",
    "pipe:1",
  ]);

  ffmpeg.stdout.pipe(res);

  await ffmpeg;
  // error logging
  ffmpeg.stderr.setEncoding("utf8");
  ffmpeg.stderr.on("data", (data) => {
    console.log(data);
  });
});

const progressRegex =
  /\[download\] *(.*) of ([^ ]*)(:? *at *([^ ]*))?(:? *ETA *([^ ]*))?/;

function getDownloadProgress(stringData) {
  if (stringData[0] !== "[") return;

  const progressMatch = stringData.match(progressRegex);

  if (!progressMatch) return;

  const progressObject = {};

  progressObject.percent = parseFloat(progressMatch[1].replace("%", ""));
  progressObject.totalSize = progressMatch[2].replace("~", "");
  progressObject.eta = progressMatch[6];

  return progressObject;
}

app.get("/haha", async (req, res) => {
  // res.writeHead(200, {
  //   "Content-Type": "application/json",
  //   "Cache-Control": "no-cache",
  //   Connection: "keep-alive",
  // });

  // const { stdout: mediaInfo } = await execa("youtube-dl", [
  //   "https://www.youtube.com/watch?v=bamxPYj0O9M",
  //   "--get-title",
  //   "--get-thumbnail",
  //   "--get-duration",
  // ]);

  // const [title, thumbnail, duration] = mediaInfo
  //   .split(/\r|\n/g)
  //   .filter(Boolean);

  // res.write(JSON.stringify({ title, thumbnail, duration }));

  // const subprocess = execa("youtube-dl", [
  //   "https://www.youtube.com/watch?v=bamxPYj0O9M",
  //   "--prefer-ffmpeg",
  //   "--extract-audio",
  //   "--audio-format",
  //   "wav",
  //   "--output",
  //   path.join(__dirname, "tmp", "%(id)s.%(ext)s"),
  // ]);

  // const rl = readline.createInterface(subprocess.stdout);

  // rl.on("line", (input) => {
  //   const progress = getDownloadProgress(input);
  //   progress && res.write(JSON.stringify(progress));
  // });

  // await subprocess;

  const peaksFile = fs.createReadStream(
    path.join(__dirname, "tmp", "bamxPYj0O9M.json")
  );

  // await execa("audiowaveform", [
  //   "-i",
  //   "tmp/bamxPYj0O9M.wav",
  //   "-o",
  //   target,
  //   "--bits",
  //   8, // try 16
  //   "--pixels-per-second",
  //   20, // try 25
  // ]);

  peaksFile.pipe(res);
});

// central custom error handler
// NOTE: DON"T REMOVE THE 'next'!!!!!
app.use(function (err, req, res, next) {
  console.log("err:", err);
  const error = createError(500, "Something went wrong. Alerted developer");

  res.status(error.status).json(error);
});

process.on("unhandledRejection", (reason, p) => {
  console.log("reason:", reason);
  // Error not caught in promises(ie. forgot the 'catch' block) will get swallowed and disappear.
  // I just caught an unhandled promise rejection,
  // since we already have fallback handler for unhandled errors (see below),
  // let throw and let him handle that
  throw reason;
});

// mainly to catch those from third-party lib. for own code, catch it in try/catch
process.on("uncaughtException", function (err) {
  console.log("err:", err);
  process.exit(1);
});

module.exports = app;
